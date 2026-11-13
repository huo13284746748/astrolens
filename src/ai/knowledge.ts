/**
 * 本地天文知识库（RAG 的检索语料）
 * 每条记录同时绑定一个推荐的可视化形态，用于「检索 → 讲解 → 演绎」闭环
 */
import type { MorphShape } from '../core/morphs';

export interface KnowledgeEntry {
  id: string;
  title: string;
  /** 别名与关键词，用于检索扩展 */
  aliases: string[];
  /** 正文，会作为 RAG 上下文注入提示词 */
  content: string;
  /** 该知识点推荐的可视化形态 */
  morph: MorphShape;
}

export const KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'blackhole',
    title: '黑洞',
    aliases: ['黑洞', '事件视界', '史瓦西', '奇点', '吸积盘', 'black hole'],
    content:
      '黑洞是引力强到连光都无法逃逸的天体。它的边界叫事件视界，视界之内任何物质和信息都无法返回。' +
      '多数黑洞由大质量恒星坍缩形成，周围物质被吸积形成明亮的吸积盘，摩擦生热可发出X射线。' +
      '2019年人类首次拍到M87星系中心黑洞的照片，2022年又拍摄了银河系中心的人马座A*。',
    morph: 'blackhole',
  },
  {
    id: 'supernova',
    title: '超新星',
    aliases: ['超新星', '爆炸', '坍缩', 'sn', 'supernova', '爆发'],
    content:
      '超新星是大质量恒星生命终点的剧烈爆发。核心坍缩后向外抛射大量物质，短时间亮度可超过整个星系。' +
      '爆发把碳、氧、铁等重元素撒入星际空间，构成后来行星与生命的原料。' +
      '历史上著名的有1054年记录的超新星，其遗迹就是今天的蟹状星云。',
    morph: 'supernova',
  },
  {
    id: 'neutronstar',
    title: '中子星',
    aliases: ['中子星', '脉冲星', '磁星', 'neutron star', 'pulsar'],
    content:
      '中子星是大质量恒星坍缩后的致密残骸，直径仅约二十公里，却拥有太阳量级的质量。' +
      '一茶匙中子星物质的质量可达数亿吨。快速自转并发出周期性射电脉冲的中子星被称为脉冲星。',
    morph: 'sphere',
  },
  {
    id: 'whitedwarf',
    title: '白矮星',
    aliases: ['白矮星', '白矮', 'white dwarf'],
    content:
      '白矮星是类太阳恒星耗尽燃料后留下的炽热核心，体积接近地球，质量却接近太阳。' +
      '它不再进行核聚变，只靠余热发光，会在漫长时间里逐渐冷却变暗。',
    morph: 'sphere',
  },
  {
    id: 'redgiant',
    title: '红巨星',
    aliases: ['红巨星', '巨星', 'red giant', '氦闪'],
    content:
      '当恒星核心氢耗尽，外层膨胀、表面温度下降，就变成红巨星。' +
      '太阳大约在五十亿年后会进入红巨星阶段，体积膨胀到可能吞没水星与金星。',
    morph: 'sphere',
  },
  {
    id: 'galaxy',
    title: '星系',
    aliases: ['星系', '银河', '螺旋星系', 'galaxy', '旋臂'],
    content:
      '星系是由恒星、气体、尘埃和暗物质在引力下聚集成的巨大系统。' +
      '按形态可分为螺旋星系、椭圆星系和不规则星系。我们的银河系是一个棒旋星系，直径约十万光年。',
    morph: 'spiral',
  },
  {
    id: 'nebula',
    title: '星云',
    aliases: ['星云', '猎户座', '发射星云', '行星状星云', 'nebula'],
    content:
      '星云是星际空间中气体与尘埃聚集形成的云雾状天体。' +
      '发射星云被年轻恒星紫外辐射电离而发光，反射星云则反射星光。' +
      '猎户座大星云是肉眼可见的恒星诞生区，距离地球约一千三百光年。',
    morph: 'nebula',
  },
  {
    id: 'starformation',
    title: '恒星诞生',
    aliases: ['恒星诞生', '恒星形成', '分子云', '原恒星', 'star formation'],
    content:
      '恒星诞生于分子云的引力坍缩。气体云在自身重力下收缩，中心温度升高，' +
      '当核心温度达到约一千万度时氢聚变点燃，一颗恒星正式诞生。' +
      '周围残留的物质盘会进一步形成行星系统。',
    morph: 'vortex',
  },
  {
    id: 'solarsystem',
    title: '太阳系',
    aliases: ['太阳系', '太阳', '行星', 'solar system'],
    content:
      '太阳系由太阳、八大行星、矮行星、卫星、小行星和彗星组成。' +
      '太阳占系统总质量的99.8%以上，通过核聚变持续释放能量，是地球生命的能量来源。',
    morph: 'ring',
  },
  {
    id: 'exoplanet',
    title: '系外行星',
    aliases: ['系外行星', '宜居带', '凌星', 'exoplanet', '超级地球'],
    content:
      '系外行星是绕太阳以外恒星运行的行星。目前已被确认的系外行星超过五千颗。' +
      '凌星法通过行星经过恒星前方造成的亮度微小下降来发现它们，' +
      '位于宜居带内的岩石行星是寻找地外生命的重要目标。',
    morph: 'ring',
  },
  {
    id: 'gravitationalwave',
    title: '引力波',
    aliases: ['引力波', 'LIGO', '时空涟漪', 'gravitational wave'],
    content:
      '引力波是加速运动的大质量天体在时空中激起的涟漪，以光速传播。' +
      '2015年LIGO首次直接探测到两个黑洞并合产生的引力波，验证了广义相对论的预言。',
    morph: 'vortex',
  },
  {
    id: 'darkmatter',
    title: '暗物质',
    aliases: ['暗物质', '暗物质晕', 'dark matter'],
    content:
      '暗物质不发光、不吸收光，只能通过引力效应被间接感知。' +
      '星系旋转曲线显示外围恒星运动过快，说明存在大量看不见的质量。' +
      '暗物质约占宇宙总物质能量的27%。',
    morph: 'nebula',
  },
  {
    id: 'darkenergy',
    title: '暗能量',
    aliases: ['暗能量', '宇宙加速膨胀', 'dark energy'],
    content:
      '暗能量是推动宇宙加速膨胀的未知成分，约占宇宙总能量的68%。' +
      '1998年通过遥远超新星的观测发现宇宙膨胀正在加速，这一发现获得了2011年诺贝尔物理学奖。',
    morph: 'nebula',
  },
  {
    id: 'bigbang',
    title: '宇宙大爆炸',
    aliases: ['大爆炸', '宇宙起源', '奇点', 'big bang', '宇宙膨胀'],
    content:
      '大爆炸理论认为宇宙约138亿年前从极高温高密的状态开始膨胀演化。' +
      '它并非在空间某点爆炸，而是空间本身在膨胀。' +
      '宇宙微波背景辐射是大爆炸残留的余晖，温度约2.7K。',
    morph: 'supernova',
  },
  {
    id: 'quasar',
    title: '类星体',
    aliases: ['类星体', '活动星系核', 'quasar', 'AGN'],
    content:
      '类星体是遥远星系中心超大质量黑洞猛烈吸积物质时形成的极亮天体，' +
      '亮度可达整个星系的数百倍，是宇宙中最明亮的天体之一。',
    morph: 'blackhole',
  },
  {
    id: 'comet',
    title: '彗星',
    aliases: ['彗星', '彗尾', '奥尔特云', 'comet'],
    content:
      '彗星是由冰、尘埃和岩石组成的小天体，来自太阳系边缘。' +
      '靠近太阳时冰升华形成彗发和彗尾，彗尾始终背向太阳。',
    morph: 'vortex',
  },
  {
    id: 'aurora',
    title: '极光',
    aliases: ['极光', '太阳风', '磁层', 'aurora'],
    content:
      '极光是太阳风带电粒子沿地球磁场进入高层大气，激发氧和氮分子发光形成的现象。' +
      '常见于高纬度地区，绿色来自氧原子，红色和紫色则与更高高度的氧和氮有关。',
    morph: 'ring',
  },
  {
    id: 'blackholemerge',
    title: '黑洞并合',
    aliases: ['黑洞并合', '双黑洞', '并合', 'merger'],
    content:
      '双黑洞在引力波辐射作用下逐渐靠近，最终并合成一个更大的黑洞，' +
      '并瞬间释放巨大能量，以引力波形式传遍宇宙。',
    morph: 'vortex',
  },
];

/** 供提示词使用的紧凑知识摘要 */
export function knowledgeDigest(): string {
  return KNOWLEDGE.map((k) => `- ${k.title}：${k.content.slice(0, 60)}…`).join('\n');
}
