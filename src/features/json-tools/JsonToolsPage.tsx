import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { messages } from '@/shared/i18n/zh';
import { DownloadIcon } from '@/shared/components/Icons';
import { Button } from '@/shared/components/Button/Button';
import { Checkbox } from '@/shared/components/Checkbox/Checkbox';
import HelpTip from '@/shared/components/HelpTip/HelpTip';
import Notice from '@/shared/components/Notice/Notice';
import AlertDialog from '@/shared/components/AlertDialog/AlertDialog';
import JsonEditor from '@/features/json-tools/components/JsonEditor';
import JsonErrorView from '@/features/json-tools/components/JsonErrorView';
import JsonValidView from '@/features/json-tools/components/JsonValidView';
import JsonTypeOutput from '@/features/json-tools/components/JsonTypeOutput';
import JsonDiffView from '@/features/json-tools/components/JsonDiffView';
import {
  createErrorLineExtension,
  createSearchCountExtension,
} from '@/features/json-tools/lib/cmExtensions';
import { MODES, PROCESS_ACTIONS, PROCESS_ACTION_LABELS } from '@/features/json-tools/constants';
import { useJsonToolsPage } from '@/features/json-tools/useJsonToolsPage';
import styles from '@/features/json-tools/JsonToolsPage.module.css';

export default function JsonToolsPage() {
  const {
    mode,
    setMode,
    action,
    setAction,
    theme,
    input,
    setInput,
    typeInput,
    setTypeInput,
    before,
    setBefore,
    after,
    setAfter,
    indent,
    setIndent,
    sortKeys,
    setSortKeys,
    lenient,
    setLenient,
    output,
    notice,
    setNotice,
    hintDialog,
    setHintDialog,
    copied,
    selected,
    fileInputRef,
    inputErrorLine,
    beforeErrorLine,
    afterErrorLine,
    downloadText,
    runDiff,
    swapSides,
    toggleSelect,
    clearSelection,
    selectAll,
    copyDiffResult,
    runAction,
    handleFile,
    loadSample,
    clearAll,
    copyOutput,
    copyInput,
    downloadOutput,
  } = useJsonToolsPage();

  const errorLineExtension = useMemo(
    () => createErrorLineExtension(inputErrorLine, styles.cmErrorLine),
    [inputErrorLine],
  );
  const searchCountExtension = useMemo(
    () => createSearchCountExtension(styles.cmSearchCount, messages.json.searchMatches),
    [],
  );
  const cmExtensions = useMemo(
    () => [json(), errorLineExtension, searchCountExtension],
    [errorLineExtension, searchCountExtension],
  );

  const errorTitle = mode === 'type' ? messages.json.typeErrorTitle : messages.json.invalid;

  /** 处理模式下按钮下方的结果/错误提示 */
  const renderProcessMessage = () => {
    if (output.kind === 'error') {
      return (
        <JsonErrorView error={output.error} side={output.side} text={input} title={errorTitle} />
      );
    }
    if (output.kind === 'valid') {
      return <JsonValidView duplicates={output.duplicates} bigNumbers={output.bigNumbers} />;
    }
    return null;
  };

  const renderOutput = () => {
    switch (output.kind) {
      case 'idle':
        return <div className={styles.placeholder}>{messages.json.outputPlaceholder}</div>;
      case 'error': {
        const text =
          output.side === 'before' ? before : output.side === 'after' ? after : input;
        return (
          <JsonErrorView error={output.error} side={output.side} text={text} title={errorTitle} />
        );
      }
      case 'text':
        return (
          <JsonTypeOutput
            output={output}
            mode={mode}
            action={action}
            onCopy={() => void copyOutput()}
          />
        );
      case 'valid':
        return <JsonValidView duplicates={output.duplicates} bigNumbers={output.bigNumbers} />;
      case 'diff':
        return (
          <JsonDiffView
            changes={output.changes}
            selected={selected}
            onToggleSelect={toggleSelect}
            onClearSelection={clearSelection}
            onSelectAll={selectAll}
            onCopyResult={() => void copyDiffResult()}
          />
        );
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerLeft}>
            <h1>{messages.json.title}</h1>
            <p className={styles.subtitle}>{messages.json.subtitle}</p>
          </div>
          <div className={styles.toolbar}>
            <Button onClick={() => fileInputRef.current?.click()}>
              {messages.json.importFile}
            </Button>
            <Button onClick={loadSample}>
              {messages.json.loadSample}
            </Button>
            <Button disabled={!downloadText} onClick={downloadOutput}>
              <DownloadIcon size={14} />
              {messages.json.download}
            </Button>
            <Button variant="danger" onClick={clearAll}>
              {messages.json.clear}
            </Button>
          </div>
        </div>

        {notice && <Notice text={notice} onClose={() => setNotice(null)} />}

        <div className={styles.modes}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === mode ? styles.modeActive : styles.mode}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className={styles.options}>
          {mode === 'process' && (
            <>
              <span className={styles.optionLabel}>{messages.json.indent}</span>
              {[2, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === indent ? styles.segmentActive : styles.segment}
                  onClick={() => setIndent(n)}
                >
                  {n}
                </button>
              ))}
              <Checkbox
                className={styles.checkbox}
                checked={sortKeys}
                onChange={setSortKeys}
                label={
                  <>
                    {messages.json.sortKeys}
                    <HelpTip text={messages.json.settingsHelp.sortKeys} />
                  </>
                }
              />
            </>
          )}
          <Checkbox
            className={styles.checkbox}
            checked={lenient}
            onChange={setLenient}
            label={
              <>
                {messages.json.lenient}
                <HelpTip text={messages.json.settingsHelp.lenient} />
              </>
            }
          />
          {mode === 'type' && (
            <span className={styles.modeHint}>{messages.json.modeTypeHint}</span>
          )}
          <span className={styles.shortcutHint}>{messages.json.keyboardHint}</span>
        </div>
      </header>

      <div className={styles.columns}>
        {mode === 'diff' ? (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.beforeLabel}</div>
              <JsonEditor
                value={before}
                onChange={setBefore}
                placeholder={messages.json.beforePlaceholder}
                highlightLine={beforeErrorLine}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.afterLabel}</div>
              <JsonEditor
                value={after}
                onChange={setAfter}
                placeholder={messages.json.afterPlaceholder}
                highlightLine={afterErrorLine}
              />
            </div>
            <div className={styles.diffResult}>
              <div className={styles.diffToolbar}>
                <Button variant="primary" onClick={() => void runDiff()}>
                  {messages.json.startCompare}
                </Button>
                <Button onClick={swapSides}>
                  {messages.json.swapSides}
                </Button>
              </div>
              {renderOutput()}
            </div>
          </>
        ) : mode === 'process' ? (
          <div className={styles.processColumn}>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <div className={styles.cmBox}>
                <CodeMirror
                  value={input}
                  onChange={setInput}
                  height="100%"
                  theme={theme === 'dark' ? 'dark' : 'light'}
                  extensions={cmExtensions}
                  placeholder={messages.json.inputPlaceholder}
                />
              </div>
            </div>
            <div className={styles.processToolbar}>
              {PROCESS_ACTIONS.map((act) => (
                <button
                  key={act}
                  type="button"
                  className={act === action ? styles.segmentActive : styles.segment}
                  onClick={() => {
                    setAction(act);
                    runAction(act);
                  }}
                >
                  {PROCESS_ACTION_LABELS[act]}
                </button>
              ))}
              <span className={styles.cmHint}>{messages.json.cmSearchHint}</span>
              <span className={styles.toolbarRight}>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!input}
                  onClick={() => void copyInput()}
                >
                  {messages.json.copy}
                </Button>
              </span>
            </div>
            {renderProcessMessage()}
          </div>
        ) : (
          <>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>{messages.json.inputLabel}</div>
              <JsonEditor
                value={typeInput}
                onChange={setTypeInput}
                placeholder={messages.json.inputPlaceholder}
                highlightLine={inputErrorLine}
              />
            </div>
            <div className={styles.editor}>
              <div className={styles.editorLabel}>
                {messages.json.outputLabel}
              </div>
              <div className={styles.output}>
                {renderOutput()}
              </div>
            </div>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      {copied && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon}>✓</span>
          {messages.json.copySuccess}
        </div>
      )}

      {hintDialog && (
        <AlertDialog
          title={messages.json.dialogTitle}
          message={hintDialog}
          confirmText={messages.json.dialogConfirm}
          onClose={() => setHintDialog(null)}
        />
      )}
    </div>
  );
}
