import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { Decoration, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** 搜索面板打开时，在编辑器右上角显示匹配数量。 */
export function createSearchCountExtension(
  countClass: string,
  formatCount: (count: number) => string,
) {
  return ViewPlugin.fromClass(
    class {
      el: HTMLElement;

      constructor(view: EditorView) {
        this.el = document.createElement('div');
        this.el.className = countClass;
        view.dom.appendChild(this.el);
        this.render(view);
      }

      update(update: ViewUpdate) {
        this.render(update.view);
      }

      render(view: EditorView) {
        const panelOpen = searchPanelOpen(view.state);
        const query = getSearchQuery(view.state);
        if (!panelOpen || !query || query.search.trim() === '') {
          this.el.style.display = 'none';
          return;
        }
        let count = 0;
        const cursor = query.getCursor(view.state.doc);
        while (!cursor.next().done) count += 1;
        this.el.textContent = formatCount(count);
        this.el.style.display = 'block';
      }

      destroy() {
        this.el.remove();
      }
    },
  );
}

/** 错误行高亮扩展；无错误行时返回空扩展。 */
export function createErrorLineExtension(line: number | null, errorClass: string) {
  if (line == null) return [];
  const deco = Decoration.line({ class: errorClass });
  return EditorView.decorations.of((view) => {
    if (line < 1 || line > view.state.doc.lines) return Decoration.none;
    const target = view.state.doc.line(line);
    return Decoration.set([deco.range(target.from)]);
  });
}
