/**
 * 邮件里的字体。和站上 globals.css 的 --font-sans 是同一个栈，改一处两边一起变。
 *
 * 为什么栈里同时有拉丁和中文：字体回退是**逐字符**的。「打开 PhilCoach」这一句里，
 * 拉丁字母走 Manrope，汉字往后落到 PingFang / 微软雅黑——一个栈同时管住中英，
 * 不用给英文单开一层标签。这也是站上的做法。
 *
 * 中文不走 webfont：CJK 字库按 unicode-range 切成几百片，邮件里没有那个预算，
 * 也没有那个必要。站上那段注释说得更清楚——真正决定「附近森林」气质的是字号、
 * 字重、行距、字距和留白，不是字形本身。
 */
export const EMAIL_FONT =
  "'Manrope',system-ui,-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/**
 * 给支持 webfont 的客户端加载 Manrope（Apple Mail、iOS Mail、Outlook for Mac、
 * Thunderbird 都吃这一套）。
 *
 * Gmail 网页版和 Outlook Windows 会把这个 <link> 整个丢掉——那是预期之内的：
 * 丢了就落到栈里下一个，中文本来就走系统字体，拉丁退到 system-ui 也依然干净。
 * 所以这封信不能有任何东西依赖 Manrope 真的加载成功。
 *
 * 只取信里实际用到的三档：正文 400、按钮和小标签 600、标题 700。
 */
export const EMAIL_FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" rel="stylesheet">';
