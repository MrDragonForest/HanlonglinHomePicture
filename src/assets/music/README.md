# 背景音乐放这里

把音频文件直接丢进这个目录就行，**不用改任何代码**，构建时会自动扫描成播放列表。

支持的格式：`.mp3` `.m4a` `.ogg` `.wav` `.flac`

- 放一首 → 单曲循环
- 放多首 → 依次播放，右下角控件里会出现「下一首」按钮
- 一首都不放 → 右下角的音乐按钮不显示

## 文件名就是曲名

控件里展开后显示的名字就是文件名（去掉扩展名），所以起个好看的名字。

## 版权

这个目录里的文件会被提交到仓库、并且公开播放，所以**只能用可商用免版权的音乐**。

推荐来源（都能免费下载、允许商用）：

| 站点 | 说明 |
| --- | --- |
| [Pixabay Music](https://pixabay.com/music/) | 免注册，量最大，直接下 MP3 |
| [Free Music Archive](https://freemusicarchive.org/) | 按授权筛选，注意选 CC0 / CC-BY |
| [Uppbeat](https://uppbeat.io/) | 免费档需要署名，音质和编曲质量高 |
| [Bensound](https://www.bensound.com/) | 免费档需署名，轻音乐多 |

搜索关键词建议：`warm piano`、`gentle acoustic guitar`、`romantic ambient`、`soft cinematic`、`lofi romantic`。

挑曲子的方向：**纯器乐、无人声、节奏慢、音量起伏小**。有人声的歌会和照片抢注意力，动态大的曲子在小音量下听着也累。

## 音质建议

同一个文件会走流量加载，建议：

- 时长 2–4 分钟、单曲循环即可
- 用 128kbps 的 MP3（3 分钟约 3MB），不用放无损
- 自己压一下的话：`ffmpeg -i 原文件.flac -b:a 128k 曲名.mp3`
