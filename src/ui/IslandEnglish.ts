/**
 * 记忆之岛 HUD 的中英双语。
 *
 * 和 `RoomEnglish.ts` 同一套做法：**中文保留，英文用小字加在下面**，
 * 而不是把中文换掉 —— 过场动画的字幕本来就是双语的（画面里中英各一行），
 * 记忆之房（RoomScene）也已经是这个形态。
 *
 * 为什么用 `innerHTML` 而不是 `textContent`：岛上的文字几乎都是整段赋值的
 * （`el.textContent = '...'`），要带一行英文就得有标签包着。
 * 调用方一律走 `bilingual(zh, en)`，别自己拼字符串，否则字号/行距会飘。
 */

const STYLE_ID = 'island-english-style';

/**
 * 英文那一行的样式，数值对齐 `RoomEnglish` 的 `.room-english`
 * （.65em / Georgia / opacity .85），只是这里略放大到 .68em —— 岛屿 HUD 的
 * 基础字号比房间里小，照抄 .65em 在 1080p 下几乎看不清。
 */
export function installIslandEnglishStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* 故意**不加** .memory-island 前缀：岛屿的「正在准备…」加载页是挂在 body 上的
       独立节点，不在 .memory-island 里面，加了前缀它就套不到样式。
       类名本身够独特，不会误伤别处。 */
    .island-en {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: .68em;
      font-weight: 400;
      line-height: 1.35;
      margin-top: 3px;
      letter-spacing: 0;
      opacity: .82;
      white-space: normal;
    }
    /* 按钮里的英文行离得近一点，否则两颗按钮一高一矮把底栏顶得很难看。 */
    button .island-en { margin-top: 2px; line-height: 1.25; }
  `;
  document.head.append(style);
}

/** 中文 + 英文小字，返回 HTML 片段（供 `innerHTML` 用）。 */
export function bilingual(zh: string, en: string): string {
  return `${zh}<span class="island-en">${en}</span>`;
}
