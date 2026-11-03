"use client";

import { useState } from "react";

type SearchFiltersProps = {
  search: string;
  types: string[];
  activeType: string;
  onSearch: (value: string) => void;
  onSelectType: (type: string) => void;
};

export default function SearchFilters({
  search,
  types,
  activeType,
  onSearch,
  onSelectType,
}: SearchFiltersProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function selectType(type: string) {
    onSelectType(type);
    setMenuOpen(false);
  }

  return (
    <>
      <div className="filter-header">
        <label className="search-box">
          <span className="visually-hidden">Поиск по каталогу</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Поиск чая..."
          />
        </label>
        <button
          type="button"
          className={`hamburger${menuOpen ? " active" : ""}`}
          aria-label={menuOpen ? "Закрыть фильтры" : "Открыть фильтры"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <nav
        className={`filter-container${menuOpen ? " active" : ""}`}
        aria-label="Фильтр по виду чая"
      >
        {types.map((type) => (
          <button
            type="button"
            className={`filter-btn${activeType === type ? " active" : ""}`}
            aria-pressed={activeType === type}
            key={type}
            onClick={() => selectType(type)}
          >
            {type === "all" ? "Все" : type}
          </button>
        ))}
      </nav>
    </>
  );
}
