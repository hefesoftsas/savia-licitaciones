/** Display names only: preserve the stored family used by document rendering. */
const names: Record<string, string> = {
  '宋体': 'SimSun', '新宋体': 'NSimSun', '黑体': 'SimHei', '楷体': 'KaiTi',
  '仿宋': 'FangSong', '微软雅黑': 'Microsoft YaHei', '微软雅黑 Light': 'Microsoft YaHei Light',
  '等线': 'DengXian', '等线 Light': 'DengXian Light', '隶书': 'LiSu', '幼圆': 'YouYuan',
  '华文宋体': 'STSong', '华文黑体': 'STHeiti', '华文楷体': 'STKaiti', '华文仿宋': 'STFangsong',
  '华文中宋': 'STZhongsong', '华文细黑': 'STXihei', '苹方': 'PingFang SC', '宋体-简': 'Songti SC',
  '黑体-简': 'Heiti SC', '楷体-简': 'Kaiti SC', '冬青黑体简体中文': 'Hiragino Sans GB',
  '思源宋体': 'Source Han Serif SC', '思源黑体': 'Source Han Sans SC',
};
export function fontDisplayName(value: string) { return names[value] || value; }
