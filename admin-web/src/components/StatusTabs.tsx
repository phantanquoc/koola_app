import { useId, useRef } from 'react';

export interface StatusTab {
  key: string;
  label: string;
  /** Số hồ sơ trong tab — hiện cạnh nhãn để biết nơi có việc. */
  count?: number;
}

interface StatusTabsProps {
  tabs: StatusTab[];
  active: string;
  onChange: (key: string) => void;
  /** id của panel chứa nội dung tab (aria-controls). Trang chưa có panel thì bỏ trống. */
  panelId?: string;
}

export function StatusTabs({ tabs, active, onChange, panelId }: StatusTabsProps) {
  const idPrefix = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = tabs.findIndex((tab) => tab.key === active);
  // active không khớp tab nào → tab đầu vẫn phải nằm trong tab order.
  const focusableIndex = activeIndex === -1 ? 0 : activeIndex;

  function selectTab(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    onChange(tab.key);
    refs.current[tab.key]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectTab(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectTab(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectTab(tabs.length - 1);
    }
  }

  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            id={`${idPrefix}-tab-${tab.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={index === focusableIndex ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span className="tab-count">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
