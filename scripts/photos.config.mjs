/**
 * 照片处理配置。
 *
 * sources  —— 原始照片所在目录（相对项目根目录）。这些目录已在 .gitignore 中排除，
 *             仓库里只保留压缩后的 public/photos/ 衍生图。
 *             后续想从别的文件夹导入，把路径加进这个数组即可。
 */
export const config = {
  // 一个批次对应一个「相册分组」，会写进清单里
  batches: [
    {
      album: '我们的 2026',
      sources: ['韩龙林 于长春'],
    },
  ],

  // 输出目录（相对项目根目录）
  outDir: 'public/photos',
  manifestFile: 'src/data/photos.json',

  // 长边像素。view 用于全屏查看，thumb 用于网格。
  sizes: {
    thumb: 560,
    view: 1920,
  },
  quality: {
    thumb: 74,
    view: 82,
  },

  // LQIP：极小尺寸的模糊占位图，内联成 base64 直接写进清单，实现「先模糊后清晰」
  lqip: {
    edge: 24,
    quality: 32,
  },

  // 只处理这些扩展名。HEIC/HEIF 不在列表里：sharp 的预编译包不含 HEIC 解码器（授权原因）。
  extensions: ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'],

  // 并发处理的图片数量
  concurrency: 4,
}
