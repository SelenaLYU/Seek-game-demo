import Phaser from 'phaser';

const copy: Record<string, string> = {
'这是韩梅梅最喜欢的故事，妈妈经常给她讲。整本故事书已经被翻得有点皱巴了。':'This is Han Meimei’s favorite story. Mom reads it to her often. The pages are creased from countless readings.',
'照片还差最后一块。去收音机旁找找。':'One piece is still missing. Look by the radio.',
'三块碎片合成了贝壳——点击它':'The three fragments formed a shell. Touch it.',
'第一章 · 记忆之房':'Chapter One · Room of Memories',
'进度仅保存在本次游玩中；关闭页面后可能丢失。':'Progress is saved for this session only and may be lost when you close the page.',
'手电筒亮了，已经收进物品栏。':'The flashlight works! It is now in your inventory.',
'无法打开。':'It will not open.',
'你捡到了一节电池。':'You found a battery.',
'你捡到了一个手电筒。':'You found a flashlight.',
'你捡到了一支画笔。':'You found a paintbrush.',
'手电筒缺少电池，没办法照光。':'The flashlight needs a battery.',
'影子拼好了。选中画笔，按顺序描完三笔风。':'Shadows complete. Select the brush and trace the three wind strokes in order.',
'影子拼好了。先找到画笔，再描出三笔风。':'Shadows complete. Find the brush, then trace three strokes of wind.',
'三笔风吹动了纸船，第三块记忆碎片出现了。':'Three strokes of wind set the boat sailing. The third memory fragment appears.',
'那天的照片':'A photograph from that day',
'爸爸妈妈第一次带5岁的韩梅梅见到了大海~':'Mom and Dad took five-year-old Han Meimei to see the sea for the first time.',
'寄居蟹鱼缸':'The hermit crab tank',
'这是韩梅梅那次从海边带回来的小寄居蟹。':'This is the little hermit crab Han Meimei brought home from the seaside.',
'三好学生':'An outstanding student',
'韩梅梅虽然学习很好，但是也是真的很皮，妈妈拿她也没有什么办法。':'Han Meimei does well at school, but she is such a little rascal that even Mom is at a loss.',
'货架后的小伙伴':'A friend behind the shelves',
'李雷撅个屁股偷偷在这个后面找什么好吃的呢。':'With his bottom sticking out, what tasty treats is Li Lei secretly looking for back here?',
'作业旁的纸船':'The paper boat beside the homework',
'除了写作业，所有的一切都很好玩。':'Everything is fun—except doing homework.',
'兔子橡皮':'A rabbit-shaped eraser',
'题还没写完，橡皮已经被刻成了一只兔子。':'The homework is unfinished, but the eraser has already become a rabbit.',
'旧糖罐':'An old candy jar',
'这个玻璃糖罐是梅梅偷偷攒下的私房糖，连妈妈都不给。':'Meimei keeps her secret candy stash in this glass jar. She will not even share it with Mom.',
'点击刻度，查看留下的记忆':'Touch a mark to discover its memory.',
'妈妈扶着尺子，韩梅梅偷偷踮起了脚。':'Mom held the ruler while Han Meimei secretly stood on tiptoe.',
'李雷也留下了一道刻痕。两个人开始比谁长得快。':'Li Lei left a mark too. They began competing to see who would grow faster.',
'五年过去，他们已经比小时候高了一大截。':'Five years later, they were much taller than they used to be.',
'完成的作业':'Finished homework',
'鸡23只，兔12只。':'23 chickens and 12 rabbits.',
'35个头，94只脚。作业已经完成。':'35 heads, 94 feet. Homework complete.',
'数学作业 · 鸡兔同笼':'Math homework · Chickens and rabbits',
'笼子里有鸡和兔，共有35个头、94只脚。':'A cage holds chickens and rabbits: 35 heads and 94 feet.',
'鸡和兔各有多少只？':'How many chickens and rabbits are there?',
'鸡':'Chickens','兔':'Rabbits','只':'animals',
'清空选中项':'Clear selection','交作业':'Submit homework',
'再算算：头数相加是35，脚数相加要是94。':'Try again: 35 heads and 94 feet in total.',
'海的另外一边是什么样子呢？':'What is it like on the other side of the sea?',
'这句话写在杂志的页边。':'These words are written in the magazine margin.',
'小卖部货架平面图':'Shop shelf layout',
'图上的记号':'Marks on the map',
'平面图已放进物品栏。关闭后点击中间货架。':'Map collected. Close this and select the middle shelf.',
'杂志夹页里藏着一张手画的货架平面图。':'A hand-drawn shelf map is tucked inside the magazine.',
'收进物品栏':'Collect','货架图':'Shelf map',
'先把桌上的作业完成吧。':'Finish the homework on the desk first.',
'翻翻杂志，找到货架的平面图吧。':'Look through the magazine for the shelf map.',
'整理货架':'Arrange the shelves',
'根据平面图交换商品的位置。':'Swap the goods to match the map.',
'中间的干脆面不能移动。':'The crispy noodles in the middle cannot be moved.',
'中间的干脆面是固定参照，不能移动。':'The middle noodles are fixed in place.',
'摆放线索':'Placement clues',
'先选一件，再选择另一件交换位置。':'Select two items to swap them.',
'检查货架':'Check shelves',
'还有线索没有对上，再检查商品之间的位置。':'Some clues do not match yet. Check the arrangement.',
'只有中间的干脆面不能换位置。':'Only the middle noodles must stay in place.',
'最上层只放饮料，最下层只放糖。':'Drinks go on top; sweets go on the bottom.',
'饼干紧挨干脆面的左边。':'Biscuits go immediately left of the noodles.',
'牛奶在饼干正上方。':'Milk goes directly above the biscuits.',
'橘子汽水在葡萄汽水左边。':'Orange soda goes left of grape soda.',
'奶糖与牛奶在同一列。':'Milk candy and milk share a column.',
'酸梅糖在泡泡糖右边。':'Plum candy goes right of bubble gum.',
'瓶盖一笔挑战':'Bottle-cap one-stroke challenge',
'每条连线只能走一次。点住任意瓶盖开始，不能抬手，也不能重复走线。':'Start at any cap. Keep dragging and trace each line exactly once.',
'从任意瓶盖开始，想好岔路的顺序。':'Start at any cap and plan your route.',
'要从一个瓶盖上按住开始。':'Press and hold a bottle cap to begin.',
'沿连接线继续画；每条线只能经过一次。':'Follow the lines, tracing each one only once.',
'路线完成了！收藏抽屉打开了。':'Route complete! The collection drawer is open.',
'还没走完所有连线，从任意瓶盖重新尝试。':'Some lines remain. Try again from any cap.',
'这个小抽屉，已经装了他们五年的小秘密。':'This little drawer holds five years of their secrets.',
'旧蜻蜓玩具':'An old dragonfly toy','玻璃弹珠':'Glass marbles',
'折皱的卡片和纸鹤':'Creased cards and paper cranes',
'吃一半的零食和旧瓶盖':'Half-eaten snacks and old bottle caps',
'收好这些回忆':'Keep these memories',
'请点开门框上的刻度，看一看他们成长留下的痕迹。':'Look at the marks on the doorframe and see how they grew.',
'现在它打不开，能听到里面有一些弹珠的声音。':'It will not open yet. You can hear marbles rattling inside.',
'卧室里的录音机':'The bedroom radio',
'轻轻转动旋钮，听听记忆里留下的声音。':'Turn the dial and listen to the sounds of memory.',
'轻轻转动旋钮。':'Gently turn the dial.',
'……沙沙的杂音。':'...Crackling static.',
'……呼呼的风声。':'...The wind is blowing.',
'虫儿飞的旋律从录音机里传出来。':'The melody of Little Fireflies drifts from the radio.',
'频道':'Channel','杂音':'Static','风声':'Wind','虫儿飞':'Little Fireflies',
'点击旋钮换台，也可以按住旋钮转动。':'Click the dial to change channels, or hold and turn it.',
'三个频道都听过了。录音机里弹出了一块照片拼图。':'All three channels heard. A photo puzzle piece pops out of the radio.',
'老挂钟':'The old wall clock','SEEK · 记忆之房':'SEEK · Room of Memories',
'钟面上的时刻':'The time on the clock',
'拖动指针调整时间。也可以选择指针后，用键盘慢慢转动。':'Drag a hand to set the time, or select it and use the keyboard.',
'时针':'Hour hand','分针':'Minute hand','确认时间':'Confirm time',
'钟声没有响起。再试一次。':'The clock did not chime. Try again.',
'挪动手电寻找视差焦点，摆动物件在海面上聚合成船':'Move the flashlight and arrange the objects to form a boat.',
'那天是韩梅梅第一次见到大海':'It was Han Meimei’s first time seeing the sea.',
'有一点点怕，但是又很喜欢……':'A little afraid, yet already in love with it...',
'笔袋 · 点击旋转':'Pencil case · Click to rotate',
'三角尺 · 点击旋转':'Set square · Click to rotate',
'细竹尺 · 点击旋转':'Bamboo ruler · Click to rotate',
'左右拖动手电筒 · 改变投影视差':'Drag the flashlight sideways to adjust the shadows.',
'从物品栏拿出手电筒，照亮桌上的物件':'Select the flashlight to light up the objects.',
'纸船顺着海风远航了':'The paper boat sails away on the sea breeze.',
'影子已契合！选画笔在画上描出三笔风':'Shadows aligned! Use the brush to trace three strokes of wind.',
'小船影子完美契合！拿上画笔，在画中描出三笔海风':'The boat is complete! Take the brush and trace three strokes of sea breeze.',
'海风吹拂，小船载着记忆远航了':'The sea breeze carries the boat and its memories away.',
'记忆碎片':'Memory fragments','画笔':'Paintbrush','手电筒':'Flashlight',
'照片拼块':'Photo piece','电池':'Battery','重玩':'Replay','返回':'Back',
'关闭':'Close','继续':'Continue','返回房间':'Back to room',
'童话书':'Fairy-tale book',
'这是海美美最喜欢的故事，要妈妈经常给她讲。整个故事书已经被翻得有点皱巴了。':'This is Meimei’s favorite story. She always asks Mom to read it. Its pages are creased from being turned so often.',
'这是韩梅梅最喜欢的故事，要妈妈经常给她讲。整个故事书已经被翻得有点皱巴了。':'This is Han Meimei’s favorite story. She often asks Mom to read it. The pages are worn from countless readings.',
'把碎片拖回相框 · 放对位置会自动吸住':'Drag each piece into the frame. It snaps into the right place.',
'点击房间里的物件寻找线索':'Click objects in the room to find clues.',
'收集三块童年记忆碎片':'Collect three fragments of childhood memories.',
'触碰贝壳，重温海边回忆':'Touch the shell to revisit the seaside memory.',
'录音机弹出了一块照片拼图，已经自动放进道具栏。现在可以去拼照片了。':'A photo piece popped out of the radio and was collected. You can finish the photo now.',
};

export function english(text: string): string {
  const clean = text.trim().replace(/^·\s*/, '');
  if (copy[clean]) return copy[clean];
  const age = clean.match(/^(\d+)岁$/);
  if (age) return 'Age ' + age[1];
  const lines = clean.split('\n').map(line => copy[line.trim().replace(/^·\s*/, '')]);
  if (lines.length > 1 && lines.every(Boolean)) return lines.join('\n');
  const progress = clean.match(/^已走 (\d+)\/(\d+) 条连接$/);
  if (progress) return progress[1] + '/' + progress[2] + ' lines traced';
  const found = clean.match(/^你捡到(?:了)?(?:一[支只个块])?(.+?)[！!。]?$/);
  if (found) return 'You found ' + (copy[found[1]] || 'an item') + '.';
  return '';
}

/** DOM 文案变化时同步英文，保留原节点及其事件。 */
export function installRoomEnglish(scene: Phaser.Scene): void {
  const translate = (root: HTMLElement) => {
    for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      if (element.closest('.room-english') || ['SCRIPT','STYLE','SVG','CANVAS'].includes(element.tagName)) continue;
      // 用换行连接被 <br> 分开的中文句子，避免小船回忆文案粘成一行后无法匹配翻译。
      const directText = [...element.childNodes]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent?.trim())
        .filter(Boolean)
        .join('\n');
      const translation = english(directText);
      const current = [...element.children].find(child => child.classList.contains('room-english'));
      if (!translation) { current?.remove(); continue; }
      if (current?.textContent === translation) continue;
      const line = current || document.createElement('span');
      line.className = 'room-english';
      line.textContent = translation;
      (line as HTMLElement).style.cssText = 'display:block;font-family:Georgia,serif!important;font-size:.65em!important;font-weight:400!important;line-height:1.3;margin-top:4px;letter-spacing:0;opacity:.85;white-space:normal;pointer-events:none';
      if (!current) element.append(line);
    }
  };
  const scan = () => document.querySelectorAll<HTMLElement>('[class^="recall-"],[class^="seek-room-"],.seek-shadow-boat,.room-item-notice').forEach(translate);
  const observer = new MutationObserver(scan);
  observer.observe(document.body, {childList:true,subtree:true,characterData:true});
  scan();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => observer.disconnect());

  const original = scene.add.text.bind(scene.add);
  scene.add.text = ((x: number, y: number, value: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => {
    const text = original(x, y, value, style);
    const set = text.setText.bind(text);
    text.setText = ((next: string | string[]) => {
      const chinese = Array.isArray(next) ? next.join('\n') : next;
      const translated = english(chinese);
      return set(translated ? chinese + '\n' + translated : chinese);
    }) as typeof text.setText;
    text.setText(value);
    return text;
  }) as typeof scene.add.text;
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { scene.add.text = original; });
}
