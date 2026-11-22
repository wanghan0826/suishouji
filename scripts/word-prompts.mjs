import {randomInt} from 'node:crypto';

const prompts = {
  food:['夜市里最想买的东西','下雨天想吃的东西','小时候爱吃的零食','夏天想喝的饮料','朋友来家里会点什么','想加到火锅里的东西'],
  life:['书包里常见的东西','周末起床后第一件事','睡不着会想起什么','宿舍停电时最想要的东西','早八路上会遇见什么','下班或放学后最想做的事'],
  places:['海边能捡到什么','夜晚路上会亮起什么','旅行时最怕忘带什么','雨后的公园里有什么','第一次见面会约在哪里','想象一座冬天的城市'],
  games:['开黑前会说什么','队友逆风翻盘时会想到什么','游戏里最舍不得卖的东西','出生点附近会遇见什么','打不过时会做什么','想带进游戏里的一件现实物品'],
  imagination:['如果云朵能带回家','月球超市会卖什么','会发光的小动物','时间暂停后先做什么','口袋里有一扇门','给星星取个名字'],
  friends:['对方常用的口头禅','见面时会顺手带什么','两个人一起最爱做的事','临时约朋友出门会去哪','想送朋友的一份小礼物','想到对方就会想到什么']
};

export function pickWordPrompt(category) {
  if (category == null || category === 'classic') return '';
  if (category === 'random') {
    const categories = Object.values(prompts);
    const choices = categories[randomInt(categories.length)];
    return choices[randomInt(choices.length)];
  }
  if (typeof category !== 'string' || !Object.hasOwn(prompts, category)) {
    throw Object.assign(Error('请选择提供的开局主题'), {status:400});
  }
  const choices = prompts[category];
  return choices[randomInt(choices.length)];
}
