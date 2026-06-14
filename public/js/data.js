// 模拟轮播歌单数据
const heroPlaylists = [
  {
    id: "h1",
    title: "抖音排行榜",
    subtitle: "抖音排行榜，每周五更新",
    playCount: "8.8亿",
    gradient: "linear-gradient(135deg, #ff6b6b, #ee5a24)",
    recommender: { name: "一只小绵羊", bio: "音乐爱好者" }
  },
  {
    id: "h2",
    title: "2025最火DJ热歌",
    subtitle: "百首全网最热DJ舞曲嗨不停",
    playCount: "641.2万",
    gradient: "linear-gradient(135deg, #6c5ce7, #a29bfe)",
    recommender: { name: "一只小绵羊", bio: "DJ达人" }
  },
  {
    id: "h3",
    title: "【旋律控】超级好听的欧美良曲",
    subtitle: "精选超级好听超级走心的欧美金曲",
    playCount: "5.0亿",
    gradient: "linear-gradient(135deg, #00b894, #00cec9)",
    recommender: { name: "一只小绵羊", bio: "欧美音乐控" }
  },
  {
    id: "h4",
    title: "80、90后回忆杀！",
    subtitle: "一起重温那些年的金曲",
    playCount: "59.6万",
    gradient: "linear-gradient(135deg, #fdcb6e, #e17055)",
    recommender: { name: "一只小绵羊", bio: "怀旧党" }
  },
  {
    id: "h5",
    title: "Dj阿智/口水旋律/劲爆音乐",
    subtitle: "希望你下次哭是因为开心",
    playCount: "23.3万",
    gradient: "linear-gradient(135deg, #0984e3, #74b9ff)",
    recommender: { name: "一只小绵羊", bio: "电音爱好者" }
  }
];

// 模拟歌单列表数据
const playlists = [
  { id: "p1", title: "英文流行｜好听又治愈的欧美歌曲", creator: "诗情画意", songCount: 126, playCount: "97.2万", color: "#ff6b6b" },
  { id: "p2", title: "2026抖音热门歌曲合集【精选】", creator: "随阳而安", songCount: 444, playCount: "121.9万", color: "#6c5ce7" },
  { id: "p3", title: "失恋DJ旋律：陪你看尽人间悲欢", creator: "晴空", songCount: 47, playCount: "36.0万", color: "#00b894" },
  { id: "p4", title: "为失眠而选丨收集困意的配乐", creator: "风潮音乐", songCount: 26, playCount: "11.7万", color: "#fdcb6e" },
  { id: "p5", title: "黑胶质感・华语流行典藏集", creator: "音乐精选", songCount: 21, playCount: "50.4万", color: "#e17055" },
  { id: "p6", title: "高燃神曲🎧用旋律给勇气加码", creator: "制作家工作室", songCount: 25, playCount: "37.8万", color: "#0984e3" },
  { id: "p7", title: "一曲此生不换，青衫湿尽离人泪", creator: "小熊不伤心", songCount: 50, playCount: "30.5万", color: "#a29bfe" },
  { id: "p8", title: "抖音治愈曲｜放在耳机里的孤独疗愈", creator: "三角习题", songCount: 61, playCount: "43.5万", color: "#00cec9" },
  { id: "p9", title: "小众英文丨遇见夏日的灵魂共鸣", creator: "TIM的CHARLOTTE", songCount: 29, playCount: "20.7万", color: "#fab1a0" },
  { id: "p10", title: "近期热歌丨一听就上头", creator: "名氏", songCount: 54, playCount: "40.9万", color: "#ff7675" },
  { id: "p11", title: "抖音热门丨2025年爆款DJ精选", creator: "小橙不放弃", songCount: 44, playCount: "96.5万", color: "#74b9ff" },
  { id: "p12", title: "公路自驾｜听旅行热歌送烦恼出走", creator: "三角习题", songCount: 72, playCount: "64.4万", color: "#55efc4" },
  { id: "p13", title: "梦回2000！千禧年流行歌单", creator: "环球音乐中国", songCount: 35, playCount: "28.5万", color: "#fd79a8" },
  { id: "p14", title: "【2025热梗合集】一秒沦陷灵魂上头神曲", creator: "_逝", songCount: 170, playCount: "108.2万", color: "#636e72" },
  { id: "p15", title: "抖音爆款丨2025热门歌曲", creator: "桃子数", songCount: 126, playCount: "262.5万", color: "#e84393" },
  { id: "p16", title: "情绪孤岛｜活在自己的频道里", creator: "阔景音乐", songCount: 43, playCount: "13.3万", color: "#0984e3" },
  { id: "p17", title: "【氛围感小众歌曲】忍不住单曲循环！", creator: "末殿", songCount: 108, playCount: "19.9万", color: "#a29bfe" },
  { id: "p18", title: "【劲爆车载DJ】动感嗨曲", creator: "随阳而安", songCount: 333, playCount: "83.0万", color: "#fdcb6e" }
];

// 分类标签
const categories = ["精选", "抖音", "经典", "情歌", "BGM", "演唱会", "游戏", "歌手"];

// 模拟当前播放歌曲
const defaultTrack = {
  id: "t1",
  name: "LOSER",
  artist: "米津玄師",
  duration: 243,
  color: "#6c5ce7"
};

// 播放列表
const playlist = [
  { id: "t1", name: "LOSER", artist: "米津玄師", duration: 243, color: "#6c5ce7" },
  { id: "t2", name: "Lemon", artist: "米津玄師", duration: 258, color: "#fdcb6e" },
  { id: "t3", name: "打上花火", artist: "DAOKO × 米津玄師", duration: 312, color: "#ff6b6b" },
  { id: "t4", name: "红莲花", artist: "米津玄師", duration: 247, color: "#e17055" },
  { id: "t5", name: "春雷", artist: "米津玄師", duration: 265, color: "#00b894" }
];

// playlistGroups 在 app.js 中定义

const playlistGroups = [
  { title: "创建的歌单", items: ["我的日推", "运动歌单", "睡前放松"] },
  { title: "收藏的歌单", items: ["抖音热歌榜", "欧美精选", "ACG动漫"] }
];
