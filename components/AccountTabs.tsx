"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type AccountTab = "profile" | "orders";

type AccountTabsProps = {
  profileContent: ReactNode;
  ordersContent: ReactNode;
};

const tabs: { id: AccountTab; label: string }[] = [
  { id: "profile", label: "Профиль" },
  { id: "orders", label: "История заказов" },
];

export default function AccountTabs({
  profileContent,
  ordersContent,
}: AccountTabsProps) {
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const tabRefs = useRef<Record<AccountTab, HTMLButtonElement | null>>({
    profile: null,
    orders: null,
  });

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div className="account-tabs">
      <div className="account-tab-list" role="tablist" aria-label="Разделы личного кабинета">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            id={`account-tab-${tab.id}`}
            aria-controls={`account-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className="account-tab"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={handleTabKeyDown}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="account-panel-profile"
        aria-labelledby="account-tab-profile"
        hidden={activeTab !== "profile"}
        role="tabpanel"
        tabIndex={0}
      >
        {profileContent}
      </div>
      <div
        id="account-panel-orders"
        aria-labelledby="account-tab-orders"
        hidden={activeTab !== "orders"}
        role="tabpanel"
        tabIndex={0}
      >
        {ordersContent}
      </div>
    </div>
  );
}
