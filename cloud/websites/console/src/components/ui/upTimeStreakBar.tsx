import React, { useState } from "react";

// --- TYPE DEFINITIONS ---
interface AppBatchItem {
  packageName: string;
  timestamp: string;
  health: string;
  onlineStatus: boolean;
}

interface UptimeStreakBarProps {
  appItems: AppBatchItem[];
  dayCount?: number;
  title?: string;
  barWidth?: string;
  barHeight?: string;
  containerWidth?: string;
  containerHeight?: string;
  currentMonth?: number;
  currentYear?: number;
  selectedDay?: number | null;
  onDayClick?: (day: number, itemsForDay: AppBatchItem[]) => void;
}

interface UptimeDayBarProps {
  day: number;
  appItems: AppBatchItem[];
  width?: string;
  height?: string;
  currentMonth?: number;
  currentYear?: number;
  isSelected?: boolean;
  onDayClick?: (day: number, itemsForDay: AppBatchItem[]) => void;
}

interface TooltipProps {
  day: number;
  healthyCount: number;
  unhealthyCount: number;
  totalCount: number;
  show: boolean;
  position: { x: number; y: number };
}

// --- CUSTOM TOOLTIP COMPONENT ---
const CustomTooltip: React.FC<TooltipProps> = ({
  day,
  healthyCount,
  unhealthyCount,
  totalCount,
  show,
  position,
}) => {
  if (!show) return null;

  return (
    <div
      className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
      style={{
        left: position.x,
        top: position.y - 8,
        maxWidth: "200px",
      }}
    >
      <div className="font-semibold mb-1">Day {day}</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span>Healthy: {healthyCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
          <span>Unhealthy: {unhealthyCount}</span>
        </div>
        <div className="text-gray-300 text-xs border-t border-gray-700 pt-1 mt-2">
          Total: {totalCount} pings
        </div>
      </div>
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
    </div>
  );
};

// --- INDIVIDUAL DAY BAR FUNCTION ---
export const updateDayBar = (
  day: number,
  appItems: AppBatchItem[],
  width?: string,
  height?: string,
  currentMonth?: number,
  currentYear?: number,
) => {
  let hasHealthy = false;
  let hasUnhealthy = false;

  // Check if appItems is valid and is an array
  if (!appItems || !Array.isArray(appItems)) {
    return (
      <div
        className={`${width || "flex-1"} ${height} bg-gray-300 rounded-[2px]`}
        title={`Day: ${day}`}
      />
    );
  }

  // Filter items that match the given day, month, and year (in local time)
  const itemsForDay = appItems.filter((app) => {
    const appDate = new Date(app.timestamp);
    const matchesDay = appDate.getDate() === day;
    const matchesMonth =
      currentMonth !== undefined ? appDate.getMonth() === currentMonth : true;
    const matchesYear =
      currentYear !== undefined ? appDate.getFullYear() === currentYear : true;
    return matchesDay && matchesMonth && matchesYear;
  });

  // If no entries for the day, return gray
  if (itemsForDay.length === 0) {
    return (
      <div
        className={`${width || "flex-1"} ${height || "h-5"} bg-gray-300 rounded-[2px]`}
        title={`Day: ${day} (No data)`}
      />
    );
  }

  // Evaluate health status of apps for this day
  for (const app of itemsForDay) {
    if (app.health === "healthy") {
      hasHealthy = true;
    } else {
      hasUnhealthy = true;
    }
  }

  // Determine color based on the rules
  let colorClass = "bg-red-500"; // Default to all unhealthy
  if (hasHealthy && !hasUnhealthy) {
    colorClass = "bg-green-500"; // All healthy
  } else if (hasHealthy && hasUnhealthy) {
    colorClass = "bg-yellow-500"; // Mixed
  }

  // Optional: Display a more descriptive tooltip with counts
  const healthyCount = itemsForDay.filter(
    (app) => app.health === "healthy",
  ).length;
  const unhealthyCount = itemsForDay.length - healthyCount;
  const tooltipText = `Day: ${day} | Healthy: ${healthyCount}, Unhealthy: ${unhealthyCount}`;

  return (
    <div
      className={`${width || "flex-1"} ${height || "h-5"} ${colorClass} rounded-[2px]`}
      title={tooltipText}
    />
  );
};

// --- ENHANCED UPTIME DAY BAR COMPONENT ---
const UptimeDayBar: React.FC<UptimeDayBarProps> = ({
  day,
  appItems,
  width,
  height,
  currentMonth,
  currentYear,
  isSelected,
  onDayClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [tooltip, setTooltip] = useState({
    show: false,
    position: { x: 0, y: 0 },
  });

  let hasHealthy = false;
  let hasUnhealthy = false;

  // Check if appItems is valid and is an array
  if (!appItems || !Array.isArray(appItems)) {
    return (
      <div
        className={`${width || "flex-1"} ${height || "h-5"} bg-gray-300 rounded-[2px] cursor-pointer transition-all duration-200 hover:bg-gray-400 active:transform active:scale-y-75 active:origin-bottom`}
        onMouseEnter={(e) => {
          setIsHovered(true);
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltip({
            show: true,
            position: {
              x: rect.left + rect.width / 2,
              y: rect.top,
            },
          });
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setTooltip({ show: false, position: { x: 0, y: 0 } });
        }}
        onClick={() => {
          setIsClicked(true);
          setTimeout(() => setIsClicked(false), 150);
        }}
      >
        <CustomTooltip
          day={day}
          healthyCount={0}
          unhealthyCount={0}
          totalCount={0}
          show={tooltip.show}
          position={tooltip.position}
        />
      </div>
    );
  }

  // Filter items that match the given day, month, and year (in local time)
  const itemsForDay = appItems.filter((app) => {
    const appDate = new Date(app.timestamp);
    const matchesDay = appDate.getDate() === day;
    const matchesMonth =
      currentMonth !== undefined ? appDate.getMonth() === currentMonth : true;
    const matchesYear =
      currentYear !== undefined ? appDate.getFullYear() === currentYear : true;
    return matchesDay && matchesMonth && matchesYear;
  });

  // If no entries for the day, return gray
  if (itemsForDay.length === 0) {
    return (
      <div
        className={`${width || "flex-1"} ${height || "h-5"} bg-gray-300 rounded-[2px] cursor-pointer transition-all duration-200 hover:bg-gray-400 active:transform active:scale-y-75 active:origin-bottom ${isClicked ? "transform scale-y-75 origin-bottom" : ""} ${isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
        onMouseEnter={(e) => {
          setIsHovered(true);
          const rect = e.currentTarget.getBoundingClientRect();
          setTooltip({
            show: true,
            position: {
              x: rect.left + rect.width / 2,
              y: rect.top,
            },
          });
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setTooltip({ show: false, position: { x: 0, y: 0 } });
        }}
        onClick={() => {
          setIsClicked(true);
          setTimeout(() => setIsClicked(false), 150);
          if (onDayClick) {
            onDayClick(day, []);
          }
        }}
      >
        <CustomTooltip
          day={day}
          healthyCount={0}
          unhealthyCount={0}
          totalCount={0}
          show={tooltip.show}
          position={tooltip.position}
        />
      </div>
    );
  }

  // Evaluate health status of apps for this day
  for (const app of itemsForDay) {
    if (app.health === "healthy") {
      hasHealthy = true;
    } else {
      hasUnhealthy = true;
    }
  }

  // Determine color based on the rules
  let colorClass = "bg-red-500"; // Default to all unhealthy
  let hoverColorClass = "hover:bg-red-600";

  if (hasHealthy && !hasUnhealthy) {
    colorClass = "bg-green-500"; // All healthy
    hoverColorClass = "hover:bg-green-600";
  } else if (hasHealthy && hasUnhealthy) {
    colorClass = "bg-yellow-500"; // Mixed
    hoverColorClass = "hover:bg-yellow-600";
  } else {
    hoverColorClass = "hover:bg-red-600";
  }

  // Calculate counts for tooltip
  const healthyCount = itemsForDay.filter(
    (app) => app.health === "healthy",
  ).length;
  const unhealthyCount = itemsForDay.length - healthyCount;

  return (
    <div
      className={`${width || "flex-1"} ${height || "h-5"} ${colorClass} ${hoverColorClass} rounded-[2px] cursor-pointer transition-all duration-200 active:transform active:scale-y-75 active:origin-bottom ${isClicked ? "transform scale-y-75 origin-bottom" : ""} ${isSelected ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
      onMouseEnter={(e) => {
        setIsHovered(true);
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltip({
          show: true,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top,
          },
        });
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setTooltip({ show: false, position: { x: 0, y: 0 } });
      }}
      onClick={() => {
        setIsClicked(true);
        setTimeout(() => setIsClicked(false), 150);
        if (onDayClick) {
          onDayClick(day, itemsForDay);
        }
      }}
    >
      <CustomTooltip
        day={day}
        healthyCount={healthyCount}
        unhealthyCount={unhealthyCount}
        totalCount={itemsForDay.length}
        show={tooltip.show}
        position={tooltip.position}
      />
    </div>
  );
};

// --- MAIN UPTIME STREAK BAR COMPONENT ---
export const UptimeStreakBar: React.FC<UptimeStreakBarProps> = ({
  appItems,
  dayCount = 30,
  barWidth = "flex-1",
  barHeight = "h-5",
  containerWidth = "w-full",
  containerHeight = "h-auto",
  currentMonth,
  currentYear,
  selectedDay,
  onDayClick,
}) => {
  return (
    <div className="flex items-center gap-0.5 overflow-hidden pl-0 w-full">
      {Array.from({ length: dayCount }, (_, index) => (
        <UptimeDayBar
          key={index + 1}
          day={index + 1}
          appItems={appItems}
          width={barWidth}
          height={barHeight}
          currentMonth={currentMonth}
          currentYear={currentYear}
          isSelected={selectedDay === index + 1}
          onDayClick={onDayClick}
        />
      ))}
    </div>
  );
};

// --- EXPORT TYPES FOR REUSE ---
export type {
  AppBatchItem,
  UptimeStreakBarProps,
  UptimeDayBarProps,
  TooltipProps,
};
