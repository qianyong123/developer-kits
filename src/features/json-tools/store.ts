import { create } from 'zustand';

/**
 * JSON 工具公共状态：输入/对比草稿与处理选项。
 * 挂在路由之上，切换工具不丢数据；刷新浏览器后重置。
 */
interface JsonToolsState {
  input: string;
  /** 类型模式独立的输入（与格式化校验模式互不干扰） */
  typeInput: string;
  before: string;
  after: string;
  indent: number;
  sortKeys: boolean;
  unwrap: boolean;
  lenient: boolean;
  setInput: (value: string) => void;
  setTypeInput: (value: string) => void;
  setBefore: (value: string) => void;
  setAfter: (value: string) => void;
  setIndent: (value: number) => void;
  setSortKeys: (value: boolean) => void;
  setUnwrap: (value: boolean) => void;
  setLenient: (value: boolean) => void;
  clearData: () => void;
}

export const useJsonToolsStore = create<JsonToolsState>()((set) => ({
  input: '',
  typeInput: '',
  before: '',
  after: '',
  indent: 2,
  sortKeys: false,
  unwrap: false,
  lenient: false,
  setInput: (input) => set({ input }),
  setTypeInput: (typeInput) => set({ typeInput }),
  setBefore: (before) => set({ before }),
  setAfter: (after) => set({ after }),
  setIndent: (indent) => set({ indent }),
  setSortKeys: (sortKeys) => set({ sortKeys }),
  setUnwrap: (unwrap) => set({ unwrap }),
  setLenient: (lenient) => set({ lenient }),
  clearData: () => set({ input: '', typeInput: '', before: '', after: '' }),
}));
