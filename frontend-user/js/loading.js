/* ========================================
   首屏加载系统
   - 数据 / 图表就绪前展示加载动画与占位骨架
   - 概览区域实时列出各区块加载状态
   - 就绪后与真实内容交叉淡入淡出，无闪动、无重叠
   - 断网 / 超时可重试，重试成功后占位块彻底移除
   ======================================== */

/* ---------- 数据服务：模拟异步取数，带断网与超时保护 ---------- */
class DataService {
    constructor() {
        this.TIMEOUT = 8000;
    }

    isOnline() {
        // 无 navigator（极端环境）时视为在线，避免误报
        return typeof navigator === 'undefined' || navigator.onLine !== false;
    }

    /**
     * 拉取一份数据
     * @param {string} key 数据键名
     * @param {*} data 本地已就绪的数据载荷
     * @param {number} baseDelay 模拟网络基础耗时(ms)
     */
    fetch(key, data, baseDelay) {
        return new Promise((resolve, reject) => {
            if (!this.isOnline()) {
                reject(this._offlineError(key));
                return;
            }

            const delay = baseDelay + Math.random() * 400;
            // 超时固定 8s；模拟耗时本身小于超时，正常请求永远先于超时完成
            const timer = setTimeout(() => {
                cleanup();
                reject(this._makeError('timeout', key, `${key} 加载超时（${this.TIMEOUT / 1000}s）`));
            }, this.TIMEOUT);

            // 加载过程中断网：立即判失败，交由重试流程恢复
            const onOffline = () => {
                cleanup();
                reject(this._offlineError(key));
            };
            window.addEventListener('offline', onOffline, { once: true });

            const cleanup = () => {
                clearTimeout(timer);
                window.removeEventListener('offline', onOffline);
            };

            setTimeout(() => {
                cleanup();
                if (data === undefined || data === null) {
                    reject(this._makeError('missing', key, `${key} 数据缺失`));
                    return;
                }
                resolve(data);
            }, delay);
        });
    }

    _offlineError(key) {
        return this._makeError('offline', key, '网络已断开，请检查连接后重新加载');
    }

    _makeError(type, key, message) {
        const err = new Error(message);
        err.type = type;
        err.dataKey = key;
        return err;
    }
}

/* ---------- ECharts 就绪保障（CDN 失败可重新注入） ---------- */
function ensureECharts(timeout = 8000) {
    return new Promise((resolve, reject) => {
        if (window.echarts) { resolve(window.echarts); return; }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            reject(new Error('网络已断开，图表库尚未加载完成'));
            return;
        }

        const existing = document.querySelector('script[data-lm-echarts="pending"]');
        if (existing) existing.parentNode.removeChild(existing);

        const script = document.createElement('script');
        script.src = `https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js?retry=${Date.now()}`;
        script.async = true;
        script.dataset.lmEcharts = 'pending';

        const timer = setTimeout(fail('timeout', '图表库加载超时'), timeout);
        const onOffline = () => fail('offline', '网络已断开，图表库加载中断');
        window.addEventListener('offline', onOffline, { once: true });

        function cleanup() {
            clearTimeout(timer);
            window.removeEventListener('offline', onOffline);
            script.dataset.lmEcharts = 'done';
        }

        function fail(type, message) {
            cleanup();
            if (script.parentNode) script.parentNode.removeChild(script);
            const err = new Error(message);
            err.type = type;
            reject(err);
        }

        script.onload = () => {
            cleanup();
            window.echarts ? resolve(window.echarts) : fail('load', '图表库加载失败');
        };
        script.onerror = () => fail('load', '图表库加载失败，请检查网络后重试');

        document.head.appendChild(script);
    });
}

/* ---------- 占位骨架构建 ---------- */
function shimmer(cls, widths) {
    return `<div class="lm-shimmer ${cls} ${widths || ''}"></div>`;
}

function buildGridSkeleton(variant, cards, quickwin) {
    let inner = '';
    for (let i = 0; i < cards; i++) {
        if (quickwin) {
            inner += `
                <div class="glass-card lm-skel-card" aria-hidden="true">
                    ${shimmer('lm-skel-icon', '')}
                    ${shimmer('lm-skel-bar', 'lm-w-60')}
                    ${shimmer('lm-skel-bar', 'lm-w-40')}
                    ${shimmer('lm-skel-bar', 'lm-w-90')}
                    ${shimmer('lm-skel-bar', 'lm-w-80')}
                    <div class="lm-skel-spacer"></div>
                    <div class="lm-skel-kpis">
                        <div class="lm-shimmer"></div>
                        <div class="lm-shimmer"></div>
                    </div>
                </div>`;
        } else {
            inner += `
                <div class="glass-card lm-skel-card" aria-hidden="true">
                    ${shimmer('lm-skel-icon', '')}
                    <div class="lm-shimmer lm-skel-line-lg"></div>
                    <div class="lm-shimmer lm-skel-line-sm"></div>
                </div>`;
        }
    }
    return `<div class="lm-skel-grid ${variant}">${inner}</div>`;
}

function buildChartSkeleton() {
    return `
        <div class="lm-chart-skel" aria-hidden="true">
            <div class="lm-skel-chart-deco">
                <div class="lm-shimmer lm-deco-line"></div>
                <div class="lm-shimmer lm-deco-line"></div>
                <div class="lm-shimmer lm-deco-line"></div>
                <div class="lm-shimmer lm-deco-line"></div>
            </div>
            <div class="loading-spinner lm-skel-spinner"></div>
            <div class="lm-shimmer lm-skel-caption"></div>
        </div>`;
}

function buildMatrixSkeleton() {
    let html = '<div class="lm-matrix-skel" aria-hidden="true">';
    html += '<div class="lm-skel-row lm-skel-head">';
    for (let i = 0; i < 4; i++) html += '<div class="lm-shimmer"></div>';
    html += '</div>';
    for (let r = 0; r < 6; r++) {
        html += '<div class="lm-skel-row lm-skel-body-row">';
        html += '<div class="lm-shimmer"></div>';
        for (let c = 0; c < 3; c++) html += '<div class="lm-shimmer"></div>';
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/* ---------- 加载管理器 ---------- */
class LoadingManager {
    constructor() {
        this.dataService = new DataService();
        this.blocks = [];
        this.overviewEl = null;
        this.firstLoad = true;
    }

    /* ===== 区块定义 ===== */
    _defineBlocks() {
        const cr = window.componentRenderer;
        const cm = window.chartManager;

        this.blocks = [
            {
                id: 'stats',
                name: '核心指标卡片',
                target: 'statsGrid',
                targetMode: 'grid',
                state: 'loading',
                token: 0,
                load: () => this.dataService.fetch('statsData', typeof statsData !== 'undefined' ? statsData : null, 700),
                render: () => cr.renderStats()
            },
            {
                id: 'funnel',
                name: 'AARRR 漏斗图',
                target: 'funnelChart',
                targetMode: 'chart',
                chartKey: 'funnel',
                state: 'loading',
                token: 0,
                load: () => Promise.all([
                    this.dataService.fetch('funnelData', typeof funnelData !== 'undefined' ? funnelData : null, 1000),
                    ensureECharts()
                ]),
                render: () => cm.initFunnelChart('funnelChart')
            },
            {
                id: 'radar',
                name: '会员能力雷达图',
                target: 'radarChart',
                targetMode: 'chart',
                chartKey: 'radar',
                state: 'loading',
                token: 0,
                load: () => Promise.all([
                    this.dataService.fetch('radarData', typeof radarData !== 'undefined' ? radarData : null, 1200),
                    ensureECharts()
                ]),
                render: () => cm.initRadarChart('radarChart')
            },
            {
                id: 'matrix',
                name: '会员战略全景矩阵',
                target: 'matrixWrapper',
                targetMode: 'matrix',
                state: 'loading',
                token: 0,
                load: () => this.dataService.fetch('matrixData', typeof matrixData !== 'undefined' ? matrixData : null, 1500),
                render: () => cr.renderMatrix()
            },
            {
                id: 'quickwins',
                name: '90天速赢行动清单',
                target: 'quickwinsGrid',
                targetMode: 'grid',
                state: 'loading',
                token: 0,
                load: () => this.dataService.fetch('quickWins', typeof quickWins !== 'undefined' ? quickWins : null, 900),
                render: () => cr.renderQuickWins()
            }
        ];
    }

    /* ===== 启动首屏加载 ===== */
    start() {
        // 刷新等场景的兜底：清掉任何历史残留占位块
        this.sweepLeftovers();
        this._defineBlocks();
        this.finished = false;
        this._renderOverview();
        this._mountSkeletons();

        this.blocks.forEach(block => this._attempt(block));

        // 网络恢复后自动重试失败区块
        window.addEventListener('online', () => {
            const failed = this.blocks.filter(b => b.state === 'error');
            if (!failed.length) return;
            window.toast && window.toast.info('网络已恢复', '正在重新加载失败的区块…');
            failed.forEach(b => this.retry(b.id));
        });
    }

    /* ===== 挂载占位骨架 ===== */
    _mountSkeletons() {
        this.blocks.forEach(block => {
            const host = document.getElementById(block.target);
            if (!host) return;
            host.classList.add('lm-target');

            const layer = document.createElement('div');
            layer.className = 'lm-layer';
            layer.dataset.lmBlock = block.id;
            layer.setAttribute('role', 'status');
            layer.setAttribute('aria-label', `${block.name}加载中`);

            if (block.targetMode === 'grid') {
                const variant = block.id === 'stats' ? 'lm-skel-stats' : 'lm-skel-quickwins';
                const count = block.id === 'stats' ? 4 : 3;
                layer.innerHTML = buildGridSkeleton(variant, count, block.id === 'quickwins');
            } else if (block.targetMode === 'chart') {
                layer.classList.add('is-overlay');
                layer.innerHTML = buildChartSkeleton();
            } else if (block.targetMode === 'matrix') {
                layer.innerHTML = buildMatrixSkeleton();
            }

            host.appendChild(layer);
            block.layer = layer;
            block.host = host;
        });
    }

    /* ===== 单区块加载尝试（token 机制保证重试结果不串台） ===== */
    _attempt(block) {
        const token = ++block.token;
        block.state = 'loading';
        this._syncBlockView(block);
        this._updateOverview();

        block.load()
            .then(() => {
                if (token !== block.token) return; // 已被更新的重试取代
                this._swapIn(block);
            })
            .catch(err => {
                if (token !== block.token) return;
                this._markError(block, err);
            });
    }

    /* ===== 占位块 → 真实内容的平滑替换 ===== */
    _swapIn(block) {
        const { host, layer } = block;

        if (block.targetMode === 'chart') {
            // 图表容器已有固定高度，骨架层从一开始就是覆盖层；
            // 旧实例必须先销毁，再在占位层下方渲染真实图表，随后交叉淡入淡出
            if (block.chartKey && window.chartManager.charts[block.chartKey]) {
                window.chartManager.charts[block.chartKey].dispose();
                delete window.chartManager.charts[block.chartKey];
            }
            block.render();
        } else {
            // 网格 / 矩阵：先把占位层脱离文档流（同步完成，浏览器无中间绘制），
            // 渲染真实内容后再以绝对覆盖层挂回，随后淡出 —— 无跳动、无重叠
            if (layer.parentNode) layer.parentNode.removeChild(layer);
            block.render();
            layer.classList.add('is-overlay');
            if (block.targetMode === 'matrix') layer.classList.add('lm-layer-matrix');
            host.appendChild(layer);
        }

        block.state = 'done';
        this._syncBlockView(block);
        this._updateOverview();

        // 强制一次重排后再开始淡出，保证过渡生效
        void layer.offsetWidth;
        layer.classList.add('is-leaving');
        this._removeLayerWhenDone(layer);
        this._maybeFinish();
    }

    _removeLayerWhenDone(layer) {
        let removed = false;
        const remove = () => {
            if (removed) return;
            removed = true;
            layer.removeEventListener('transitionend', onEnd);
            if (layer.parentNode) layer.parentNode.removeChild(layer);
        };
        const onEnd = (e) => {
            // 只响应占位层自身的透明度过渡
            if (e.target === layer && (e.propertyName === 'opacity' || !e.propertyName)) remove();
        };
        layer.addEventListener('transitionend', onEnd);
        // 兜底：过渡事件丢失时也必须彻底移除
        setTimeout(remove, 650);
    }

    /* ===== 失败态 ===== */
    _markError(block, err) {
        block.state = 'error';
        block.errorType = err && err.type ? err.type : 'error';

        const layer = block.layer;
        if (layer) {
            layer.classList.add('is-error');
            layer.querySelector('.lm-error')?.remove();

            const box = document.createElement('div');
            box.className = 'lm-error';
            const icon = block.errorType === 'offline' ? '📡' : '⏱️';
            const hint = (err && err.message) || '加载失败，请重试';
            box.innerHTML = `
                <div class="lm-error-icon">${icon}</div>
                <div class="lm-error-text">${hint}</div>
                <button type="button" class="lm-btn-retry">↻ 重新加载</button>
            `;
            box.querySelector('.lm-btn-retry').addEventListener('click', () => this.retry(block.id));
            layer.appendChild(box);
            layer.setAttribute('role', 'alert');
        }

        this._syncBlockView(block);
        this._updateOverview();
    }

    /* ===== 用户重试 ===== */
    retry(blockId) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block || block.state === 'done') return;

        // 彻底清理旧的失败占位块，再重新挂一块干净的骨架
        this._resetBlockSkeleton(block);
        this._attempt(block);
    }

    reloadFailed() {
        this.blocks.filter(b => b.state === 'error').forEach(b => this.retry(b.id));
    }

    _resetBlockSkeleton(block) {
        const old = block.layer;
        if (old && old.parentNode) old.parentNode.removeChild(old);

        // 清理可能残留的半成品内容。
        // 注意：网格宿主本身就是渲染目标，可整体清空；
        // 矩阵宿主内还包含真实的 <table id="matrixTable">，只能移除占位层，不能清空表格。
        const host = document.getElementById(block.target);
        if (host && block.targetMode === 'grid') host.innerHTML = '';

        const layer = document.createElement('div');
        layer.className = 'lm-layer';
        layer.dataset.lmBlock = block.id;
        layer.setAttribute('role', 'status');
        layer.setAttribute('aria-label', `${block.name}加载中`);

        if (block.targetMode === 'grid') {
            const variant = block.id === 'stats' ? 'lm-skel-stats' : 'lm-skel-quickwins';
            const count = block.id === 'stats' ? 4 : 3;
            layer.innerHTML = buildGridSkeleton(variant, count, block.id === 'quickwins');
        } else if (block.targetMode === 'chart') {
            layer.classList.add('is-overlay');
            layer.innerHTML = buildChartSkeleton();
        } else {
            layer.innerHTML = buildMatrixSkeleton();
        }

        if (host) {
            host.appendChild(layer);
            block.host = host;
        }
        block.layer = layer;
    }

    /* ===== 区块在概览列表中的状态行 ===== */
    _syncBlockView(block) {
        const row = this.overviewEl && this.overviewEl.querySelector(`.lo-row[data-block="${block.id}"]`);
        if (!row) return;
        row.classList.toggle('is-done', block.state === 'done');
        row.classList.toggle('is-error', block.state === 'error');

        const status = row.querySelector('.lo-row-status');
        if (block.state === 'loading') {
            status.innerHTML = `<span class="loading-spinner lo-mini-spinner"></span><span>加载中</span>`;
        } else if (block.state === 'done') {
            status.innerHTML = `<span class="lo-status-done">✓ 已就绪</span>`;
        } else {
            const label = block.errorType === 'offline' ? '网络断开'
                : block.errorType === 'timeout' ? '加载超时' : '加载失败';
            status.innerHTML = `
                <span class="lo-status-error">✕ ${label}</span>
                <button type="button" class="lm-btn-retry is-mini">重新加载</button>
            `;
            status.querySelector('.lm-btn-retry').addEventListener('click', () => this.retry(block.id));
        }
    }

    /* ===== 加载概览区域 ===== */
    _renderOverview() {
        const overview = document.createElement('section');
        overview.className = 'glass-card loading-overview';
        overview.setAttribute('aria-live', 'polite');

        const rows = this.blocks.map(b => `
            <div class="lo-row" data-block="${b.id}">
                <span class="lo-row-name">${b.name}</span>
                <span class="lo-row-status">
                    <span class="loading-spinner lo-mini-spinner"></span><span>加载中</span>
                </span>
            </div>
        `).join('');

        overview.innerHTML = `
            <div class="lo-header">
                <span class="loading-spinner lo-spinner"></span>
                <span class="lo-title">正在加载驾驶舱数据…</span>
                <span class="lo-progress">0 / ${this.blocks.length}</span>
            </div>
            <div class="lo-list">${rows}</div>
            <div class="lo-actions" hidden>
                <button type="button" class="lm-btn-retry">↻ 重新加载失败区块</button>
            </div>
        `;
        overview.querySelector('.lm-btn-retry').addEventListener('click', () => this.reloadFailed());

        // 插入到头部之后、统计卡片区之前
        const statsSection = document.querySelector('.stats-section');
        if (statsSection && statsSection.parentNode) {
            statsSection.parentNode.insertBefore(overview, statsSection);
        }
        this.overviewEl = overview;
    }

    _updateOverview() {
        const el = this.overviewEl;
        if (!el) return;

        const doneCount = this.blocks.filter(b => b.state === 'done').length;
        const errorBlocks = this.blocks.filter(b => b.state === 'error');
        const hasError = errorBlocks.length > 0;
        const allDone = doneCount === this.blocks.length;

        el.querySelector('.lo-progress').textContent = `${doneCount} / ${this.blocks.length}`;
        el.querySelector('.lo-actions').hidden = !(hasError && this.blocks.every(b => b.state !== 'loading'));

        // 头部状态标记随状态整体切换：加载中转圈 / 部分失败警告 / 全部完成对勾
        const markerHolder = el.querySelector('.lo-header');
        const need = allDone ? 'done' : hasError ? 'error' : 'loading';
        if (markerHolder.dataset.loState !== need) {
            const old = markerHolder.querySelector('.lo-spinner, .lo-state-icon');
            const fresh = need === 'loading'
                ? Object.assign(document.createElement('span'), { className: 'loading-spinner lo-spinner' })
                : Object.assign(document.createElement('span'), {
                    className: `lo-state-icon ${need === 'done' ? 'lo-status-done' : 'lo-status-error'}`,
                    textContent: need === 'done' ? '✓' : '⚠️'
                });
            old ? old.replaceWith(fresh) : markerHolder.insertBefore(fresh, markerHolder.firstChild);
            markerHolder.dataset.loState = need;
        }

        const title = el.querySelector('.lo-title');
        if (allDone) {
            title.textContent = '全部区块加载完成';
        } else if (hasError) {
            title.textContent = `部分区块加载失败（${errorBlocks.length} 个），可重新加载`;
        } else {
            title.textContent = '正在加载驾驶舱数据…';
        }
    }

    _maybeFinish() {
        if (this.finished || !this.blocks.every(b => b.state === 'done')) return;
        this.finished = true;

        this._updateOverview();

        if (this.firstLoad) {
            this.firstLoad = false;
            setTimeout(() => {
                window.toast && window.toast.success(
                    '欢迎使用诊断驾驶舱',
                    '数据已加载完成，点击各模块查看详情',
                    5000
                );
            }, 350);
        }

        // 概览先淡出，再将高度/外边距收合为 0，避免下方区块上跳；彻底移除节点
        const overview = this.overviewEl;
        setTimeout(() => {
            overview.style.maxHeight = `${overview.scrollHeight}px`;
            void overview.offsetHeight; // 记录起点高度，保证下一步过渡生效
            overview.classList.add('is-collapsing');
            overview.style.maxHeight = '0px';

            let removed = false;
            const remove = () => {
                if (removed) return;
                removed = true;
                overview.removeEventListener('transitionend', onEnd);
                if (overview.parentNode) overview.parentNode.removeChild(overview);
            };
            const onEnd = (e) => {
                if (e.target === overview && (e.propertyName === 'max-height' || e.propertyName === 'opacity')) remove();
            };
            overview.addEventListener('transitionend', onEnd);
            setTimeout(remove, 700);
        }, 500);
    }

    /* ===== 兜底：清除任何残留占位块（刷新后不残留） ===== */
    sweepLeftovers() {
        document.querySelectorAll('.lm-layer, .loading-overview').forEach(el => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        document.querySelectorAll('.lm-target').forEach(el => el.classList.remove('lm-target'));
    }

    /* ===== 手动刷新：已就绪内容直接重渲染，失败区块重新走加载流程 ===== */
    refresh() {
        this.sweepLeftovers();
        if (!this.blocks.length) {
            this.start();
            return;
        }
        const failed = this.blocks.filter(b => b.state === 'error');
        if (failed.length) {
            failed.forEach(b => this.retry(b.id));
            return;
        }
        // 全部就绪：直接重渲染，不产生占位块
        window.componentRenderer.renderStats();
        window.componentRenderer.renderMatrix();
        window.componentRenderer.renderQuickWins();
        if (window.chartManager.charts.funnel) {
            window.chartManager.charts.funnel.dispose();
            delete window.chartManager.charts.funnel;
            window.chartManager.initFunnelChart('funnelChart');
        }
        if (window.chartManager.charts.radar) {
            window.chartManager.charts.radar.dispose();
            delete window.chartManager.charts.radar;
            window.chartManager.initRadarChart('radarChart');
        }
        window.chartManager.resize();
    }
}

window.loadingManager = new LoadingManager();
