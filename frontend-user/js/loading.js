/* ========================================
   首屏加载 - 数据 / 图表资源加载服务
   - 模拟各区块异步就绪
   - 区块级加载超时
   - ECharts CDN 就绪检测与按需补载
   - 断网中止 / 重连恢复
   ======================================== */

class LoadingDataService {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        // 演示参数：?fail=funnel 模拟某区块超时失败；?fast=1 快速加载
        this.failBlock = params.get('fail');
        this.fast = params.get('fast') === '1';
        this.echartsSrc = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
        this.echartsPromise = null;
        this.blockTimeout = this.fast ? 3000 : 8000;
    }

    // 模拟网络延迟（数据就绪）；错开各区块时间，呈现逐条淡入
    simulatedDelay(blockKey) {
        if (this.fast) return 120 + Math.random() * 120;
        const base = {
            stats: 500,
            funnel: 900,
            radar: 1300,
            matrix: 1700,
            quickwins: 2100
        };
        return (base[blockKey] || 800) + Math.random() * 400;
    }

    offlineError(msg = '网络已断开') {
        return Object.assign(new Error(msg), { code: 'offline' });
    }

    // 加载单个区块；signal 用于断网 / 重试时主动中止
    loadBlock(block, { signal } = {}) {
        return new Promise((resolve, reject) => {
            if (!navigator.onLine) {
                reject(this.offlineError());
                return;
            }

            let settled = false;
            const onAbort = () => finish(reject, Object.assign(new Error('已取消加载'), { code: 'aborted' }));
            const onOffline = () => finish(reject, this.offlineError());

            const finish = (fn, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', onAbort);
                window.removeEventListener('offline', onOffline);
                fn(value);
            };

            const timer = setTimeout(() => {
                finish(reject, Object.assign(new Error('加载超时'), { code: 'timeout' }));
            }, this.blockTimeout);

            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            window.addEventListener('offline', onOffline, { once: true });

            setTimeout(() => {
                // 演示：指定区块不响应，等待超时
                if (this.failBlock && block.key === this.failBlock && !this.fast) return;
                finish(resolve, { key: block.key, readyAt: Date.now() });
            }, this.simulatedDelay(block.key));
        });
    }

    // 确保 ECharts 已就绪（轮询 + 必要时补载脚本）
    ensureECharts({ signal } = {}) {
        if (window.echarts) return Promise.resolve(window.echarts);
        if (this.echartsPromise) return this.echartsPromise;

        this.echartsPromise = new Promise((resolve, reject) => {
            if (!navigator.onLine) {
                this.echartsPromise = null;
                reject(this.offlineError('网络已断开，图表引擎加载失败'));
                return;
            }

            const waitMax = Math.max(4000, this.blockTimeout);
            const deadline = Date.now() + waitMax;
            let finished = false;
            let script = null;
            let pollTimer = null;
            let deadlineTimer = null;

            const onAbort = () => finish(reject, Object.assign(new Error('已取消加载'), { code: 'aborted' }));
            const onOffline = () => finish(reject, this.offlineError('网络已断开，图表引擎加载失败'));

            const cleanup = () => {
                clearInterval(pollTimer);
                clearTimeout(deadlineTimer);
                if (signal) signal.removeEventListener('abort', onAbort);
                window.removeEventListener('offline', onOffline);
                if (script) {
                    script.onload = null;
                    script.onerror = null;
                }
            };

            const finish = (fn, value) => {
                if (finished) return;
                finished = true;
                cleanup();
                if (fn === reject) this.echartsPromise = null;
                fn(value);
            };

            deadlineTimer = setTimeout(() => {
                finish(reject, Object.assign(new Error('图表引擎加载超时'), { code: 'timeout' }));
            }, waitMax);

            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            window.addEventListener('offline', onOffline, { once: true });

            const injectScript = () => {
                if (script) return; // 每次尝试最多补载一个脚本
                // 页面中已有的同址脚本说明初次 <script> 仍在加载或已失败；
                // 为支持失败后重试，这里追加一个带重试标记的新脚本。
                script = document.createElement('script');
                const existing = document.querySelector('script[src*="echarts"]');
                script.src = this.echartsSrc + (existing ? '?retry=' + Date.now() : '');
                script.async = true;
                script.onload = () => { /* 轮询会检测全局就绪 */ };
                script.onerror = () => finish(reject, Object.assign(new Error('图表引擎资源加载失败'), { code: 'network' }));
                document.head.appendChild(script);
            };

            pollTimer = setInterval(() => {
                if (window.echarts) {
                    finish(resolve, window.echarts);
                } else if (Date.now() > deadline) {
                    finish(reject, Object.assign(new Error('图表引擎加载超时'), { code: 'timeout' }));
                } else {
                    injectScript();
                }
            }, 150);
        });

        return this.echartsPromise;
    }
}

window.loadingDataService = new LoadingDataService();


/* ========================================
   首屏加载管理器
   - 骨架占位 / 概览列表 / 交叉淡入替换
   - 超时与断网失败重试（重连自动重试）
   ======================================== */

const LOADING_BLOCKS = [
    { key: 'stats', name: '核心指标卡片', icon: '🎯', type: 'stage', stageId: 'statsStage' },
    { key: 'funnel', name: 'AARRR 漏斗图', icon: '📊', type: 'chart', containerId: 'funnelChart' },
    { key: 'radar', name: '会员能力雷达图', icon: '🎯', type: 'chart', containerId: 'radarChart' },
    { key: 'matrix', name: '战略全景矩阵', icon: '📋', type: 'stage', stageId: 'matrixStage' },
    { key: 'quickwins', name: '90天速赢清单', icon: '⚡', type: 'stage', stageId: 'quickwinsStage' }
];

class LoadingManager {
    constructor(renderers = {}) {
        this.renderers = renderers;
        this.service = window.loadingDataService;
        this.phase = 'idle'; // idle | loading | error | done
        this.generation = 0;
        this.statuses = {};
        this.overlay = null;
        this.onComplete = null;

        window.addEventListener('online', () => this.handleOnline());
    }

    /* ---------- 启动 ---------- */
    start() {
        const gen = ++this.generation;
        this.phase = 'loading';

        document.body.classList.add('is-booting');
        this.ensureOverlay();
        this.resetOverlay();
        this.resetStages();
        this.injectChartSkeletons();

        const signal = this.controller = new AbortController();

        LOADING_BLOCKS.forEach(block => {
            this.setStatus(block.key, 'loading', '加载中');
            this.runBlock(block, gen, signal.signal);
        });
    }

    async runBlock(block, gen, signal) {
        try {
            await this.service.loadBlock(block, { signal });
            if (gen !== this.generation) return;

            try {
                if (block.type === 'chart') {
                    await this.service.ensureECharts({ signal });
                    if (gen !== this.generation) return;
                    await this.renderers[block.key]();
                    if (gen !== this.generation) return;
                    this.revealChart(block.containerId);
                } else {
                    await this.renderers[block.key]();
                    if (gen !== this.generation) return;
                    await this.revealStage(block.stageId);
                }
            } catch (renderErr) {
                if (renderErr && renderErr.code) throw renderErr;
                throw Object.assign(new Error('内容渲染异常'), { code: 'render' });
            }

            if (gen !== this.generation) return;
            this.setStatus(block.key, 'loaded', '已就绪');
            this.maybeComplete(gen);
        } catch (err) {
            if (gen !== this.generation || err.code === 'aborted') return;
            this.setStatus(block.key, 'failed', '失败');
            this.maybeComplete(gen, err);
        }
    }

    maybeComplete(gen, lastError) {
        if (gen !== this.generation || this.phase !== 'loading') return;
        const pending = LOADING_BLOCKS.some(b => !['loaded', 'failed'].includes(this.statuses[b.key]));
        if (pending) return;

        const failed = LOADING_BLOCKS.filter(b => this.statuses[b.key] === 'failed');
        if (failed.length) {
            this.showError(lastError || new Error('部分区块加载失败'));
        } else {
            this.complete();
        }
    }

    /* ---------- 成功收尾：覆盖层淡出后彻底移除 ---------- */
    complete() {
        this.phase = 'done';
        const overlay = this.overlay;
        overlay.setAttribute('aria-busy', 'false');
        overlay.classList.add('is-leaving');
        this.setSubtitle('所有内容已就绪');

        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            this.overlay = null;
            document.body.classList.remove('is-booting');
            if (typeof this.onComplete === 'function') this.onComplete();
        }, 520);
    }

    /* ---------- 失败：概览标红 + 错误面板 + 重试 ---------- */
    showError(err) {
        this.phase = 'error';
        const overlay = this.overlay;
        const title = overlay.querySelector('.loading-title');
        const subtitle = overlay.querySelector('.loading-subtitle');
        const errorTitle = overlay.querySelector('.loading-error-title');
        const errorDesc = overlay.querySelector('.loading-error-desc');

        const messages = {
            timeout: ['⏱️ 加载超时', '数据或图表资源在规定时间内未响应，请检查网络后重新加载。'],
            offline: ['📡 网络已断开', '当前无法连接网络，请检查网络连接后重新加载；网络恢复后将自动重试。'],
            network: ['🔗 资源加载失败', '图表引擎资源无法下载，请检查网络后重新加载。'],
            render: ['🧩 内容渲染异常', '部分区块在渲染时发生错误，请重新加载。']
        };
        const [t, d] = messages[err.code] || ['⚠️ 加载失败', '部分内容未能加载完成，请重新加载。'];

        title.textContent = '加载遇到问题';
        subtitle.textContent = '部分区块加载失败，已加载内容保持不变';
        errorTitle.textContent = t;
        errorDesc.textContent = d;

        overlay.classList.add('is-error');
        overlay.querySelector('.loading-retry').classList.remove('is-retrying', 'is-online-pulse');

        if (window.toast) {
            window.toast.error('加载失败', d, 5000);
        }
    }

    retry() {
        if (this.phase === 'loading' || this.retrying) return;
        this.retrying = true;
        if (this.controller) this.controller.abort();
        const btn = this.overlay && this.overlay.querySelector('.loading-retry');
        if (btn) btn.classList.add('is-retrying');
        if (window.toast) window.toast.info('重新加载', '正在重新建立连接…');
        // 让“重试中”状态先渲染一帧再启动
        requestAnimationFrame(() => {
            setTimeout(() => {
                this.retrying = false;
                this.start();
            }, 120);
        });
    }

    handleOnline() {
        if (this.phase !== 'error') return;
        const btn = this.overlay && this.overlay.querySelector('.loading-retry');
        if (btn) btn.classList.add('is-online-pulse');
        if (window.toast) window.toast.success('网络已恢复', '正在自动重新加载…');
        setTimeout(() => this.retry(), 600);
    }

    /* ---------- 区块交叉淡入替换 ---------- */
    revealStage(stageId) {
        return new Promise(resolve => {
            const stage = document.getElementById(stageId);
            if (!stage) { resolve(); return; }

            const content = stage.querySelector('.stage-content');

            // 1. 以骨架当前高度锁定容器
            stage.classList.add('is-crossfading');
            stage.style.height = `${stage.offsetHeight}px`;

            // 2. 同一帧切换：骨架淡出 / 内容淡入（无闪动、无重叠留白）
            requestAnimationFrame(() => {
                stage.classList.add('is-ready');

                // 3. 高度平滑过渡到内容真实高度（窄屏宽屏节奏一致）
                requestAnimationFrame(() => {
                    stage.style.height = `${content.scrollHeight}px`;
                });
            });

            const finish = () => {
                stage.classList.remove('is-crossfading');
                stage.classList.remove('is-ready');
                stage.classList.add('is-done');
                stage.style.height = '';
                // 占位块彻底从 DOM 移除（重试时由 resetStages 重新注入）
                const skeletonEl = stage.querySelector('.stage-skeleton');
                if (skeletonEl) skeletonEl.innerHTML = '';
                stage.setAttribute('aria-busy', 'false');
                resolve();
            };

            // 兜底：transitionend + 超时双保险
            let done = false;
            const onEnd = (e) => {
                if (e.propertyName === 'height' && e.target === stage) {
                    if (done) return;
                    done = true;
                    stage.removeEventListener('transitionend', onEnd);
                    finish();
                }
            };
            stage.addEventListener('transitionend', onEnd);
            setTimeout(() => { if (!done) { done = true; stage.removeEventListener('transitionend', onEnd); finish(); } }, 900);
        });
    }

    revealChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        // 容器尺寸未变，骨架绝对覆盖淡出后移除，避免 ECharts 闪动
        container.classList.add('is-ready');
        if (window.chartManager) {
            requestAnimationFrame(() => window.chartManager.resize());
        }
        setTimeout(() => {
            const skeleton = container.querySelector('.chart-skeleton');
            if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
        }, 480);
    }

    /* ---------- 重置（重试时彻底清除占位与旧内容，保证一致） ---------- */
    resetStages() {
        const clearStage = (stageId, targetId, skeletonHtml) => {
            const stage = document.getElementById(stageId);
            if (!stage) return;
            stage.classList.remove('is-ready', 'is-done', 'is-crossfading');
            stage.style.height = '';
            stage.setAttribute('aria-busy', 'true');

            const target = document.getElementById(targetId);
            if (target) target.innerHTML = '';

            const skeleton = stage.querySelector('.stage-skeleton');
            skeleton.innerHTML = skeletonHtml;
        };

        clearStage('statsStage', 'statsGrid', this.buildStatSkeletons());
        clearStage('matrixStage', 'matrixTable', this.buildMatrixSkeletons());
        clearStage('quickwinsStage', 'quickwinsGrid', this.buildQuickwinSkeletons());
    }

    injectChartSkeletons() {
        ['funnelChart', 'radarChart'].forEach(id => {
            const container = document.getElementById(id);
            if (!container) return;
            container.classList.remove('is-ready');
            container.innerHTML = `
                <div class="chart-skeleton">
                    <div class="loading-spinner"></div>
                    <div class="sk-block chart-skeleton-bar"></div>
                    <div class="sk-block chart-skeleton-bar" style="width:52%"></div>
                </div>
            `;
        });
    }

    /* ---------- 骨架结构 ---------- */
    buildStatSkeletons() {
        let html = '';
        for (let i = 0; i < 4; i++) {
            html += `
                <div class="skeleton-card glass-card skeleton-stat">
                    <div class="sk-block sk-stat-icon"></div>
                    <div class="sk-block sk-stat-value"></div>
                    <div class="sk-block sk-stat-label"></div>
                </div>
            `;
        }
        return html;
    }

    buildQuickwinSkeletons() {
        let html = '';
        for (let i = 0; i < 3; i++) {
            html += `
                <div class="skeleton-card glass-card skeleton-quickwin">
                    <div class="sk-qw-header">
                        <div class="sk-block sk-qw-icon"></div>
                        <div style="flex:1">
                            <div class="sk-block sk-qw-title"></div>
                            <div class="sk-block sk-qw-timeline"></div>
                        </div>
                    </div>
                    <div class="sk-block sk-qw-line"></div>
                    <div class="sk-block sk-qw-line"></div>
                    <div class="sk-block sk-qw-line short"></div>
                    <div class="sk-qw-kpi">
                        <div class="sk-block"></div>
                        <div class="sk-block"></div>
                    </div>
                </div>
            `;
        }
        return html;
    }

    buildMatrixSkeletons() {
        let cells = '';
        for (let c = 0; c < 4; c++) {
            cells += '<div class="sk-block sk-matrix-head"></div>';
        }
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                cells += '<div class="sk-block sk-matrix-cell"></div>';
            }
        }
        return `
            <div class="skeleton-card glass-card skeleton-matrix">
                <div class="sk-matrix-scroll">
                    <div class="sk-matrix-grid">${cells}</div>
                </div>
            </div>
        `;
    }

    /* ---------- 加载覆盖层 ---------- */
    ensureOverlay() {
        if (this.overlay && document.body.contains(this.overlay)) return;

        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'loadingOverlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-busy', 'true');
        overlay.setAttribute('aria-label', '首屏加载状态');

        overlay.innerHTML = `
            <div class="glass-card loading-panel">
                <div class="loading-logo"></div>
                <div class="loading-title">驾驶舱数据加载中</div>
                <div class="loading-subtitle">正在准备数据与图表，请稍候…</div>
                <div class="loading-overview"></div>
                <div class="loading-error">
                    <div class="loading-error-title"></div>
                    <div class="loading-error-desc"></div>
                </div>
                <button class="btn btn-primary loading-retry" type="button">🔄 重新加载</button>
                <div class="loading-hint">背景动画持续播放中，无需刷新页面</div>
            </div>
        `;

        overlay.querySelector('.loading-retry').addEventListener('click', () => this.retry());
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.buildOverview();
    }

    buildOverview() {
        const list = this.overlay.querySelector('.loading-overview');
        list.innerHTML = LOADING_BLOCKS.map((block, i) => `
            <div class="loading-item" data-key="${block.key}" style="animation-delay:${0.05 * i}s">
                <span class="loading-item-dot"></span>
                <span class="loading-item-icon">${block.icon}</span>
                <span class="loading-item-name">${block.name}</span>
                <span class="loading-item-status">等待中</span>
            </div>
        `).join('');
        LOADING_BLOCKS.forEach(b => { this.statuses[b.key] = 'pending'; });
    }

    resetOverlay() {
        const overlay = this.overlay;
        overlay.classList.remove('is-leaving', 'is-error');
        overlay.setAttribute('aria-busy', 'true');
        overlay.querySelector('.loading-title').textContent = '驾驶舱数据加载中';
        this.setSubtitle('正在准备数据与图表，请稍候…');

        overlay.querySelectorAll('.loading-item').forEach(item => {
            item.classList.remove('is-loaded', 'is-failed');
            const status = item.querySelector('.loading-item-status');
            status.textContent = '等待中';
            this.statuses[item.dataset.key] = 'pending';
        });
        overlay.querySelector('.loading-retry').classList.remove('is-retrying', 'is-online-pulse');
    }

    setStatus(key, state, text) {
        this.statuses[key] = state;
        if (!this.overlay) return;
        const item = this.overlay.querySelector(`.loading-item[data-key="${key}"]`);
        if (!item) return;
        item.classList.toggle('is-loaded', state === 'loaded');
        item.classList.toggle('is-failed', state === 'failed');
        item.querySelector('.loading-item-status').textContent = text;
    }

    setSubtitle(text) {
        const el = this.overlay && this.overlay.querySelector('.loading-subtitle');
        if (el) el.textContent = text;
    }
}

window.LoadingManager = LoadingManager;
window.LOADING_BLOCKS = LOADING_BLOCKS;
