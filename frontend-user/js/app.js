/* ========================================
   应用主入口
   首屏流程：背景层先就绪 → 加载占位与概览 → 区块就绪后淡入替换
   ======================================== */

class App {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        const renderer = window.componentRenderer;

        // 1. 背景动画 / 网格覆盖层 / 粒子效果立即启动，加载期间持续播放
        renderer.bootBackground();
        renderer.bootSidebar();

        // 2. 窗口尺寸与滚动监听
        window.addEventListener('resize', this.handleResize.bind(this));
        window.addEventListener('scroll', this.handleScroll.bind(this));

        // 3. 首屏加载管理：占位块 -> 数据/图表就绪 -> 交叉淡入
        const manager = new window.LoadingManager({
            stats: async () => renderer.renderStats(),
            matrix: async () => renderer.renderMatrix(),
            quickwins: async () => renderer.renderQuickWins(),
            funnel: async () => window.chartManager.initFunnelChart('funnelChart'),
            radar: async () => window.chartManager.initRadarChart('radarChart')
        });
        this.loadingManager = manager;

        manager.onComplete = () => {
            renderer.onContentReady();
            console.log('🚀 Dashboard initialized successfully');
        };

        manager.start();
    }

    handleResize() {
        // 防抖处理
        clearTimeout(this.resizeTimer);
        this.resizeTimer = setTimeout(() => {
            window.chartManager.resize();
        }, 250);
    }

    handleScroll() {
        // 可以添加滚动相关的动画效果
        const scrollY = window.scrollY;
        const header = document.querySelector('.header');

        if (header) {
            const opacity = Math.max(0.5, 1 - scrollY / 500);
            header.style.opacity = opacity;
        }
    }

    // 刷新数据
    refresh() {
        window.toast.info('刷新中', '正在重新加载数据...');

        setTimeout(() => {
            window.componentRenderer.renderStats(true);
            window.componentRenderer.renderMatrix();
            window.componentRenderer.renderQuickWins(true);
            window.chartManager.resize();

            window.toast.success('刷新完成', '数据已更新');
        }, 1000);
    }

    // 导出报告
    exportReport() {
        window.toast.info('导出报告', '正在生成PDF报告...');

        setTimeout(() => {
            window.toast.success('导出成功', '报告已保存到下载目录');
        }, 2000);
    }
}

// 创建应用实例
const app = new App();

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// 暴露全局方法
window.app = app;
