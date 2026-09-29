# 我们的小日子

一个用来展示生活照片的静态相册站点。温馨浪漫的排版，长图 / 竖图自动识别，翻页丝滑，部署在 GitHub Pages 上不需要服务器。

## 特性

- **自适应网格排版**：按宽高比自动分成横片、竖片、方片、全景四类。全景照片（宽高比 ≥ 1.9）自动占满整行。
- **顺滑的共享元素转场**：点缩略图，照片从原位置「飞」到全屏；退出时飞回原来的格子（不在视野里会先滚回去）。
- **两套主题**：暖色 / 深色，右上角切换，选择记在 `localStorage` 里，刷新后保持。深色主题在首帧前就套用，不会闪白屏。
- **先模糊后清晰**：每张图附带一个 24px 的极小占位图（内联成 base64 写在清单里）和主色背景，加载时不会出现空洞。
- **可选背景音乐**：往 `src/assets/music/` 丢音频文件即自动出现在播放列表，一首都不放则不显示控件。
- **两种加图方式**：本地脚本批量处理（处理相机原图）或网页后台直传（在浏览器里压缩后提交到 GitHub）。
- **键盘 / 手势翻页**：查看器里支持 ← → 方向键、Esc 关闭、左右滑动切换、下滑关闭。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
```

其他命令：

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 类型检查 + 打包到 `dist/` |
| `npm run preview` | 本地预览打包结果 |
| `npm run photos` | 处理原图文件夹，增量更新清单与衍生图 |
| `npm run photos:force` | 同上，但忽略缓存、全部重跑 |

## 加照片

仓库里只保存压缩后的衍生图（`public/photos/`），几百 MB 的相机原图不进版本库。有两种加图方式，按场景选。

### 方式一：本地脚本（适合一次导入一大批相机原图）

1. 把原图放进 `韩龙林 于长春/`（或任何目录，路径写进 `scripts/photos.config.mjs` 的 `sources`）。
2. 跑 `npm run photos`。

脚本会按拍摄日期把图分到 `public/photos/<日期>/`，每张生成 `-thumb.webp`（网格用，长边 560）和 `-view.webp`（全屏用，长边 1920），并更新 `src/data/photos.json`。已经处理过的照片会跳过，所以后续再跑只处理新增的。

处理尺寸、质量、输出目录都在 `scripts/photos.config.mjs` 里改。

> 不支持 HEIC / HEIF —— sharp 的预编译包出于授权原因不含 HEIC 解码器。先在系统「预览」里导出成 JPEG 再导入。

### 方式二：网页后台（适合人在外面，用手机或别人的电脑加几张）

打开 `#/admin`（本地是 `http://localhost:5173/#/admin`，线上是 `https://<用户名>.github.io/<仓库名>/#/admin`）。

1. 第一次进去填三样东西：仓库 `owner`、`repo`，以及一个 GitHub **fine-grained token**。验证通过后这些会存在浏览器 `localStorage`（键名 `gallery:github`），下次不用重填。
2. 拖入或选择照片，浏览器本地压缩成同样规格的 WebP，逐张填标题 / 描述 / 地点。
3. 点发布，通过 GitHub Git Data API 一次性原子提交图片、清单和文案到仓库。仓库那边一提交，Pages 就会自动重新部署。

Token 需要的最小权限：**Contents: Read and write**（只给这一个仓库）。它只存在你自己的浏览器里，不会进代码、不会上传到任何第三方。

> 这个页面是纯前端的，token 直接在这台浏览器上调用 GitHub API。所以**只在自己的电脑上用**，不要在公用电脑上填 token。

## 给照片配文字

文字和图片信息分开存：`src/data/photos.json` 由脚本生成（不要手改），`src/data/captions.json` 是手写的。

```jsonc
{
  "2026-09-14/160A6311": {
    "title": "那天的窗边",     // 查看器左上角的标题
    "caption": "光刚好落下来",  // 标题下方的一行
    "location": "长春"        // 地点
  }
}
```

key 就是照片 id（`日期/文件名`）。两个脚本都**不会覆盖**这个文件里已有的内容，所以随时可以放心重跑照片处理。

- 本地脚本：新照片不会自动写进来，但 `npm run photos` 结束时会把「还没有文案」的 id 打出来，复制粘贴补上即可。
- 后台直传：在页面上填的标题 / 描述 / 地点会直接合并进这个文件一起提交；留空的字段不写，保持文件干净。

三个字段任何一个留空，页面上就不显示。

## 改文案和开关

页面上的文字、以及各种行为开关都在 `src/data/site.config.ts`，不用动组件：

- 标题、副标题、开场小字、页脚落款
- 是否显示拍摄参数（光圈 / 快门 / ISO / 焦段）
- 音乐自动播放、音量、淡入淡出时长
- 网格每列的最小宽度（浏览器据此决定一行放几张，默认 380）
- 全屏查看器里是否显示底部胶片条

## 背景音乐

把音频丢进 `src/assets/music/` 就行，无需改代码。支持 `.mp3` `.m4a` `.ogg` `.wav` `.flac`。详细说明（包括免版权音乐来源和音质建议）见 [`src/assets/music/README.md`](src/assets/music/README.md)。

浏览器一般会拦截自动播放，所以进入页面后音频可能是暂停的 —— 页面会在用户第一次交互时自动续播，右下角也有手动开关。

## 部署到 GitHub Pages

仓库里已经带好 `.github/workflows/deploy.yml`，推到 `main` 就会自动构建并发布。

1. 关联远端并推送：

   ```bash
   git init -b main
   git add .
   git commit -m "初始化生活相册站点"
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```

   首次推送会提示输入用户名和密码 —— 密码位置填 **Personal Access Token**（fine-grained，权限只给该仓库的 `Contents: Read and write`；classic 则勾 `repo`）。macOS 会把凭据存进钥匙串，之后不用再输。

   如果建仓库时勾了「Add a README」，远端已有一个提交，直接推会被拒。先合并再接上：

   ```bash
   git pull --rebase origin main
   git push -u origin main
   ```

2. 仓库需要是**公开**的 —— GitHub Free 不支持从私有仓库发布 Pages。若还没开 Pages，工作流里的 `configure-pages` 会自动把它启用并设为 GitHub Actions 源，一般不用手动设置（必要时也可自己去 **Settings → Pages → Source** 选 **GitHub Actions**）。
3. 等 Actions 跑完，站点地址：

   - 普通仓库（项目页）：`https://<用户名>.github.io/<仓库名>/`
   - 用户主页仓库（仓库名形如 `<用户名>.github.io`）：`https://<用户名>.github.io/`

**关于资源路径**：项目页的地址带仓库名前缀，所以打包时 `base` 得跟着变。`deploy.yml` 会自动判断仓库类型并设置 `VITE_BASE`，你不用管。本地要模拟项目页效果时手动带一下：

```bash
VITE_BASE=/<仓库名>/ npm run build
VITE_BASE=/<仓库名>/ npm run preview
```

路由用的是 hash（`#/admin`），所以 Pages 上不需要配任何重写规则。

## 目录结构

```
scripts/
  build-photos.mjs      原图 → WebP + 清单（Node 端）
  photos.config.mjs     处理配置：源目录、尺寸、质量、输出
src/
  shared/photoMeta.mjs  纯函数：宽高比分类、EXIF 格式化、清单合并（Node 和浏览器共用）
  data/
    site.config.ts      文案与开关
    photos.json         照片清单（脚本生成，勿手改）
    captions.json       手写文案
  lib/
    photos.ts           合并清单与文案、日期格式化、按天分组
    music.ts            扫描 src/assets/music/ 生成播放列表
    tileRegistry.ts     记录缩略图 DOM，供查看器做转场与回滚定位
  hooks/
    useLayout.ts        最短列网格算法、列数断点、进场触发
    useTheme.ts         主题读写与持久化
    useHashRoute.ts     hash 路由（#/admin）
  components/           Hero / Gallery / PhotoTile / SmartImage / Viewer / Filmstrip / MusicPlayer / ThemeSwitch
  admin/                后台页面（压缩 + GitHub 提交）
  styles/               CSS（主题变量 + 各区块样式）
```

## 技术说明

Vite 6 + React 18 + TypeScript，动画用 Framer Motion，图片处理用 sharp（Node）和 exifr（EXIF，Node 与浏览器共用）。

几个实现上值得一提的点：

- **共享元素转场没有用 `layoutId`**。查看器是 portal 渲染的，跨 portal 的 `layoutId` 不会真的做补间，还会让退场动画永不结束。全屏图和缩略图宽高比完全一致，所以直接用 `translate + scale` 就是精确的共享元素转场（`src/components/Viewer.tsx` 的 `flight`）。
- **退场动画放完用定时器卸载**，而不是等 motion 的 `onAnimationComplete` —— 翻过页之后那个回调不再可靠触发，会导致查看器关不掉。
- **网格用最短列算法**（`useMasonry`），每列等宽、相对高度取 `1 / aspect`。切主题 / 改窗口宽度都不会重排跳动。

## 已知限制

- 不支持 HEIC / HEIF 原图（见上文）。
- 后台直传需要 fine-grained token，只能在个人浏览器里用；没有后端，也没有多用户权限体系。
- 照片全部走静态资源，第一次访问一个大相册时流量会比较集中，建议原图先压到 1920 长边（脚本默认就是这样）。
