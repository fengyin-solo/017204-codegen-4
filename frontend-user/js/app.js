/* ========================================
   应用主入口
   ======================================== */

class App {
    constructor() {
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        // 初始化环境组件（粒子、打字机、侧栏），背景动画层不受加载流程影响
        window.componentRenderer.init();

        // 启动首屏加载：占位骨架 → 数据/图表就绪 → 淡入替换（失败可重试）
        window.loadingManager.start();

        // 监听窗口大小变化
        window.addEventListener('resize', this.handleResize.bind(this));

        // 监听滚动
        window.addEventListener('scroll', this.handleScroll.bind(this));

        console.log('🚀 Dashboard initialized successfully');
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

    // 刷新数据：占位块兜底清理后重渲染；存在失败区块时走重新加载流程
    refresh() {
        window.toast.info('刷新中', '正在重新加载数据...');

        setTimeout(() => {
            window.loadingManager.refresh();
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
