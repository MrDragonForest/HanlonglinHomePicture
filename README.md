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
- **手机上的「自动浏览」**：左下角一个开关（默认关闭），点开后像有人替你慢慢往下翻 —— 每张停 5 秒再滑到下一张。只在触屏 / 窄屏出现，你自己一碰就立刻让位。

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

脚本会按拍摄日期把图分到 `public/photos/<日期>/`，每张按**宽度**生成一套多档 WebP，并更新 `src/data/photos.json`：

| 图 | 档位（宽度 px） |
| --- | --- |
| 竖图 / 方图 | `420 / 640 / 960 / 1440` |
| 横图 | `420 / 640 / 960 / 1440 / 1920` |
| 全景（整行铺满） | `420 / 960 / 1440 / 2880` |

这几档的区别在于全屏查看器里能长到多宽：竖图是「高度撑满、宽度窄」，1440 就够；横图是「高度撑满、宽度撑开」，2x 屏需要 1800 左右，所以补一档；全景整行铺满，需要更宽。已经处理过的照片会跳过，所以后续再跑只处理新增的。

多档图是为了在高密度屏上不糊：手机 1 个 CSS 像素往往对应 3 个物理像素，只出一档固定尺寸的话 Retina 屏拿到的是被拉伸的糊图。前端把清单里的阶梯展开成 `srcset`，浏览器按屏幕密度自己挑一档，保证「挑到的档位宽度 ≥ 当前 CSS 宽度 × 设备像素比」，也就是永远不放大。实测一屏 24 张的流量：普通屏 372 KB（420 档），Retina 屏 1.28 MB（960 档），3x 手机 2.31 MB（1440 档）—— 比改之前（单档 373px 的糊图共 442 KB）普通屏反而更省。

档位、画质、输出目录都在 `scripts/photos.config.mjs` 里改。改档位之后要跑一次 `npm run photos:force` 全量重做，并且顺手删掉不再被引用的旧文件（`public/photos/` 里多余的 `-<宽度>.webp`），否则它们会一直留在仓库里、也一直会被部署出去。

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
- 自动浏览的停留时长（`autoTour.dwellMs`，默认 5000 毫秒）

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

2. 仓库需要是**公开**的 —— GitHub Free 不支持从私有仓库发布 Pages。
3. **手动启用一次 Pages**：**Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**，然后 Save。

   这一步不能省。工作流里的 `configure-pages` 带了 `enablement: true`，但 Actions 的 `GITHUB_TOKEN` 无权创建 Pages 站点（实测报 `Create Pages site failed: Resource not accessible by integration`），仓库没开过 Pages 时会直接卡在这一步。开过之后它是幂等的，后续跑不会再要求你操作。

4. 等 Actions 跑完，站点地址：

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
    useAutoTour.ts      手机端自动浏览：预取下一张，再平滑滚过去
  assets/fonts/         自托管的 Cormorant Garamond（可变字体，latin 子集）
  components/           Hero / Gallery / PhotoTile / SmartImage / Viewer / Filmstrip / MusicPlayer / ThemeSwitch / AutoTourButton
  admin/                后台页面（压缩 + GitHub 提交）
  styles/               CSS（主题变量 + 各区块样式）
```

## 技术说明

Vite 6 + React 18 + TypeScript，动画用 Framer Motion，图片处理用 sharp（Node）和 exifr（EXIF，Node 与浏览器共用）。

几个实现上值得一提的点：

- **共享元素转场没有用 `layoutId`**。查看器是 portal 渲染的，跨 portal 的 `layoutId` 不会真的做补间，还会让退场动画永不结束。全屏图和缩略图宽高比完全一致，所以直接用 `translate + scale` 就是精确的共享元素转场（`src/components/Viewer.tsx` 的 `flight`）。
- **退场动画放完用定时器卸载**，而不是等 motion 的 `onAnimationComplete` —— 翻过页之后那个回调不再可靠触发，会导致查看器关不掉。
- **网格用最短列算法**（`useMasonry`），每列等宽、相对高度取 `1 / aspect`。切主题 / 改窗口宽度都不会重排跳动。
- **多档图 + `srcset` 解决高密度屏发糊**。清单里每张照片带一条按宽度递增的阶梯，网格和查看器都用同一条阶梯、各自的 `sizes`：
  - 网格的 `sizes` 在 `src/lib/photos.ts` 的 `TILE_SIZES`，百分比是按 `gallery.css` 的 `--shell / --gutter / --gap` 反推出来的，**改列数或间距时要一起改**，否则 `sizes` 会偏大（白下载高一档）或偏小（又糊了）。
  - 查看器的 `sizes` 用 JS 实测的外框宽度（`box.w`）。外框宽度和网格格子宽度几乎相同，所以浏览器会挑到和网格已经下载过的**同一档**，点开详情不用再等一次网络。
- **字体自托管，`index.html` 里没有任何外链样式表**。原先用 `<link>` 引 `fonts.googleapis.com` 的 CSS，那是**渲染阻塞**资源：该域名不可达时（国内很常见）浏览器会一直挂在那儿等，整页白屏直到超时 —— 实测 FCP 永远不来，24 个格子一个都不渲染。现在 Cormorant Garamond 放在 `src/assets/fonts/`，由 `src/styles/fonts.css` 用 `@font-face` 声明。它是可变字体，正体 / 斜体各一个文件、合计 77 KB，`font-weight: 300 700` 一个声明覆盖全部字重；只含 latin 子集，中文本来就由 `--font-display` 回退栈里的系统宋体渲染，不用下载。别再把 Google Fonts 的 `<link>` 加回来。
- **自动浏览靠「先预取、再滚动」绕开 `loading="lazy"` 的死锁**（`src/hooks/useAutoTour.ts`）。网格是懒加载的，视口外很远的图压根不会开始下载，所以「等它加载完再滚过去」会永远等下去。做法是用 `new Image()` 带上同一份 `srcset` / `sizes` 主动取一次（`sizes` 用这一格的真实像素宽度，保证挑中和格子同一档，不多下一份也不白下高一档），借浏览器缓存把「已加载」变成既成事实，然后才平滑滚过去。等平滑滚动结束没用 `scrollend`（Safari 支持得晚），而是逐帧看 `scrollY` 是否连续 8 帧静止；另外马赛克分列后 DOM 顺序和视觉顺序不一致，起点必须按实际纵坐标重排，否则会在一列里来回跳。

## 已知限制

- 不支持 HEIC / HEIF 原图（见上文）。
- 后台直传需要 fine-grained token，只能在个人浏览器里用；没有后端，也没有多用户权限体系。
- 照片全部走静态资源，第一次访问一个大相册时流量会比较集中。现在一屏 24 张的实测流量是：普通屏 372 KB、Retina 屏 1.28 MB、3x 手机 2.31 MB —— 想更省可以在 `scripts/photos.config.mjs` 里删掉 1440 那一档，代价是 3x 手机重新变糊。
- 单张照片没有「放大到 100%」的交互，最高一档是 1440 宽（横图 1920、全景 2880），不是相机原图。真要抠细节还是得下原图。
