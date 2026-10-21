export interface StatusTab {
  key: string;
  label: string;
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
        </button>
      ))}
    </div>
  );
}
