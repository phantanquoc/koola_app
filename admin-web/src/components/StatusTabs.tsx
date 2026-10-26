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
}

export function StatusTabs({ tabs, active, onChange }: StatusTabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          type="button"
          aria-selected={tab.key === active}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {typeof tab.count === 'number' && tab.count > 0 && (
            <span className="tab-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
