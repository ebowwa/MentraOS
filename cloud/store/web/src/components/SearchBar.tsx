import React from 'react';
import { Search } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onClear: () => void;
  className?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  onClear,
  className = ''
}) => {
  const { theme } = useTheme();

  return (
    <form onSubmit={onSearchSubmit} className={`flex items-center space-x-3 ${className}`}>
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
        </div>
        <input
          type="text"
          className="theme-search-input w-full pl-10 pr-4 py-2 rounded-3xl focus:outline-none focus:ring-2 focus:ring-[#47478E] border"
          style={{
            backgroundColor: theme === 'light' ? 'var(--bg-secondary)' : '#141834',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-color)'
          }}
          placeholder="Search"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
        />
      </div>
      {searchQuery && (
        <button
          type="button"
          className="text-[15px] font-normal tracking-[0.1em]"
          style={{ color: 'var(--text-primary)' }}
          onClick={onClear}
        >
          Cancel
        </button>
      )}
    </form>
  );
};

export default SearchBar;