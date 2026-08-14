/**
 * 邮件里的字体。两个栈都取自站上 globals.css，改一处两边一起变。
 *
 * 为什么一个栈里同时有拉丁和中文：字体回退是**逐字符**的。「打开 PhilCoach」
 * 这一句里，拉丁字母走拉丁那款，汉字往后落到系统中文字体——一个栈同时管住中英，
 * 不用给英文单开一层标签。这也是站上的做法。
 */

/**
 * 主字体（站上的 --font-sans）。事务性邮件用这个：验证码、新节点通知、
 * 订单、反馈那几封——它们是 UI，不是文章。
 */
export const EMAIL_FONT =
  "'Manrope',system-ui,-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/**
 * 人文内容（站上的 --font-serif）。那封「致你的一封信」用这个——
 * 它和宣言、理念、创造者故事、冥想文案是同一类东西，不是界面。
 *
 * 和站上那一栈有两处**有意的不同**，都是被邮件的现实逼出来的：
 *
 * 一、拿掉 Noto Serif SC。它在邮件里的方向是反的：
 *     Apple Mail / iOS 会加载它——可那些设备本来就有 Songti SC，质量不输，
 *     而一封中文长信要拉进 330 个 unicode-range 分片；
 *     真正需要它的 Outlook Windows（只有 SimSun）又会把 <link> 整个剥掉，
 *     它一片也加载不到。在不需要的地方加载，在需要的地方加载不了。
 *     所以改成直接点名各平台真实装着的宋体，一个字节都不用下。
 *
 * 二、Georgia 必须排在中文字体**前面**。站上是 ui-serif → Georgia，
 *     而 macOS 的 ui-serif 是带汉字的：万一 EB Garamond 没加载出来，
 *     拉丁字母会先掉进中文字体自带的那套很丑的拉丁，永远够不到 Georgia。
 *     现在拉丁只会落在 EB Garamond 或 Georgia 上，两个都好看；
 *     汉字对这两个都不匹配，径直往后走到宋体。逐字符回退，各走各的。
 *
 * 各客户端的实际落点：
 *   Apple Mail / iOS   拉丁 EB Garamond，中文 Songti SC
 *   Gmail（link 被剥） 拉丁 Georgia，中文 Songti SC / 思源宋体（Android）
 *   Outlook Windows    拉丁 Georgia，中文 SimSun ← 最弱的一环
 */
export const EMAIL_SERIF =
  "'EB Garamond',Georgia,'Songti SC','STSong','Source Han Serif SC','Noto Serif CJK SC','SimSun',serif";

/**
 * 给支持 webfont 的客户端加载那封信要用的字体（Apple Mail、iOS Mail、
 * Outlook for Mac、Thunderbird 吃这一套）。
 *
 * Gmail 网页版和 Outlook Windows 会把这个 <link> 整个丢掉——那是预期之内的：
 * 丢了就落到栈里下一个。所以这封信不能有任何东西依赖 webfont 真的加载成功。
 *
 * 只加载拉丁：EB Garamond 三档（正文 400 / 强调 600 / 标题 700），
 * 加按钮用的 Manrope 600。整份几十 KB。
 *
 * **不加载任何中文 webfont**。中文字库按 unicode-range 切片，一封中文长信
 * 会把三百多个分片全拉进来；而各平台本来就装着能用的宋体，省下的这一大坨
 * 换不来对应的观感提升。这也和站上「中文不加载 webfont」的判断一致。
 */
export const EMAIL_FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600;700&family=Manrope:wght@600&display=swap" rel="stylesheet">';
