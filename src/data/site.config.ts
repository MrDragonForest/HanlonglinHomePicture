/**
 * 站点文案与开关。改这里就能改页面上的文字，不需要动组件。
 */
export const site = {
  /** 浏览器标签页标题与开场大标题 */
  title: '我们的小日子',

  /** 开场标题下方的一句话 */
  subtitle: '把平凡的日子，过成值得收藏的样子',

  /** 开场区最上方的小字 */
  eyebrow: 'PHOTO ALBUM',

  /** 页脚右侧的落款 */
  signature: '韩龙林 · 于长春',

  /** 是否显示每张照片的拍摄参数（光圈/快门/ISO/焦段） */
  showExif: true,

  /** 背景音乐 */
  music: {
    /** 进入页面后是否尝试自动播放（浏览器通常会拦截，拦截后会等用户第一次交互再播） */
    autoplay: true,
    /** 播放时的目标音量 0–1 */
    volume: 0.4,
    /** 淡入时长（毫秒） */
    fadeInMs: 1800,
    /** 淡出时长（毫秒） */
    fadeOutMs: 700,
    /** 记住用户的播放开关与音量 */
    remember: true,
  },

  /** 网格每列的最小宽度，浏览器据此决定一行放几张 */
  gridMinColumnWidth: 380,

  /** 全屏查看器里是否显示底部胶片条 */
  filmstrip: true,
} as const
