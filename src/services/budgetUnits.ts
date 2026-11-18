/**
 * 报价计量单位清单。
 *
 * 依据 docs/BUDGET_SECTIONS.md §7.3：真实装企模板里出现的单位有 11 类，
 * 其中包含复合单位（楼梯按级、清运按层、找平按厘米厚度、橱柜按套米）与按户/间计数。
 *
 * 单位必须从枚举里选，不能再让企业手填自由文本——历史上出现过把规格「mm」
 * 填进单位字段的情况，直接参与计算会把「299 元/㎡」当成「299 元/mm」放大 1000 倍。
 */
export interface BudgetUnitOption {
  /** 与后端 BudgetUnitKind 名称一致。 */
  kind: string;
  /** 落库时写入的规范单位文本。 */
  unit: string;
  label: string;
  hint: string;
}

export const budgetUnitOptions: BudgetUnitOption[] = [
  { kind: 'SQM', unit: '㎡', label: '平方米', hint: '面积类：瓷砖、地板、涂料、墙纸' },
  { kind: 'LM', unit: '米', label: '延米', hint: '长度类：踢脚线、门槛石、窗套' },
  { kind: 'PIECE', unit: '个', label: '件 / 樘', hint: '计数类：木门、开关、地漏' },
  { kind: 'SET', unit: '套', label: '套 / 项', hint: '成套或整体计价：橱柜、吊顶' },
  { kind: 'PACKAGE', unit: '桶', label: '桶 / 袋 / 箱', hint: '包装类：涂料、腻子、水泥' },
  { kind: 'DAY', unit: '工日', label: '工日', hint: '人工按天计价' },
  { kind: 'LM_PER_LEVEL', unit: 'm/级', label: '米 / 级', hint: '楼梯踏步按级计价' },
  { kind: 'SQM_PER_FLOOR', unit: 'm2/层', label: '平方米 / 层', hint: '垃圾清运按层计价' },
  { kind: 'LM_PER_FLOOR', unit: 'm/层', label: '米 / 层', hint: '材料上楼按层计价' },
  { kind: 'CM_PER_SQM', unit: 'cm/m2', label: '厘米 / 平方米', hint: '落差找平按厚度计价' },
  { kind: 'SET_LM', unit: '套米', label: '套米', hint: '橱柜沿米计价' },
  { kind: 'HOUSE', unit: '户', label: '户', hint: '按户整体计价' },
  { kind: 'ROOM', unit: '间', label: '间', hint: '按间计价' }
];

export const budgetUnitByKind = new Map(budgetUnitOptions.map((option) => [option.kind, option]));

/** 单位文本 → 枚举名；与后端 BudgetUnitKind.fromLabel 保持同一套规则。 */
export function unitKindOf(unit: string | null | undefined): string {
  const raw = (unit ?? '').trim();
  if (!raw) return 'UNKNOWN';
  const lower = raw.toLowerCase();
  const direct: Record<string, string> = {
    '㎡': 'SQM', 'm2': 'SQM', 'm²': 'SQM', '平方米': 'SQM', '平米': 'SQM', '平方': 'SQM',
    'm': 'LM', '米': 'LM', '延米': 'LM',
    'm/级': 'LM_PER_LEVEL', 'm2/层': 'SQM_PER_FLOOR', '㎡/层': 'SQM_PER_FLOOR',
    'm/层': 'LM_PER_FLOOR', 'cm/m2': 'CM_PER_SQM', 'cm/㎡': 'CM_PER_SQM',
    '樘': 'PIECE', '个': 'PIECE', '件': 'PIECE', '块': 'PIECE', '片': 'PIECE', '扇': 'PIECE', '盏': 'PIECE', '根': 'PIECE',
    '套': 'SET', '项': 'SET', '组': 'SET',
    '桶': 'PACKAGE', '袋': 'PACKAGE', '箱': 'PACKAGE', '包': 'PACKAGE',
    '工日': 'DAY', '人日': 'DAY', '天': 'DAY',
    '套米': 'SET_LM', '户': 'HOUSE', '间': 'ROOM'
  };
  return direct[lower] ?? 'UNKNOWN';
}

export function isUnitRecognized(unit: string | null | undefined): boolean {
  return unitKindOf(unit) !== 'UNKNOWN';
}

export const unitUnknownHint = '单位无法识别，预算计算会跳过这条报价。请从下拉里选一个计量单位，规格尺寸填在「规格」字段。';

/** 单位无法归一的报价对读者统一显示这句，企业端与 C 端共用。 */
export const unitUnknownBadge = '单位待确认，不参与比价';
