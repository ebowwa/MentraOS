import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, XCircle, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UptimeStreakBar } from '@/components/ui/upTimeStreakBar';

// Removed unused month constants

// Define the data structures using TypeScript interfaces
interface UptimeEvent {
  date: string;
  duration: number; // in minutes
  reason: string;
  details: string;
}

interface AppStatus {
  id: string;
  name: string;
  logo: string;
  packageName?: string;
  submitted: string;
  uptimePercentage: number;
  status: 'Online' | 'Offline';
  uptimeHistory: string[];
  details: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    events: UptimeEvent[];
  };
}

// Mock data removed - using real data from appItems

// Removed fake random data generation - using real appItems data

// Removed unused UptimeBar and Legend components

// Status Badge Component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = () => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'online':
      case 'operational':
        return 'bg-green-500';
      default:
        return 'bg-red-600';
    }
  };

  const getStatusText = () => {
    switch (status.toLowerCase()) {
      case 'healthy':
      case 'online':
      case 'operational':
        return 'Online';
      default:
        return 'Offline';
    }
  };

  return (
    <Badge variant="outline" className="text-xs w-17">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
      <span>{getStatusText()}</span>
    </Badge>
  );
};

// Removed MonthlyUptimeChart component - using real data in AppUptimeChart instead

// Component for the detailed view of a single app

interface AppBatchItem {
  packageName: string;
  timestamp: string;
  health: string;
  onlineStatus: boolean;
}

interface AppDetailViewProps {
  app: AppStatus;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  appItems: AppBatchItem[];
  selectedDay?: number | null;
  selectedDayItems?: AppBatchItem[];
  currentMonth?: number;
  currentYear?: number;
}



export const AppDetailView: React.FC<AppDetailViewProps> = ({ app, onRefresh, isRefreshing = false, appItems, selectedDay, selectedDayItems, currentMonth, currentYear }) => {
  const [dayFilterState, setDayFilterState] = useState<{
    selectedDay: number | null;
    selectedDayItems: AppBatchItem[];
    currentMonth: number;
    currentYear: number;
  }>({
    selectedDay: null,
    selectedDayItems: [],
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
  });

  const handleDaySelection = (day: number | null, items: AppBatchItem[], month: number, year: number) => {
    setDayFilterState({
      selectedDay: day,
      selectedDayItems: items,
      currentMonth: month,
      currentYear: year,
    });
  };

  return (
  <div className=" min-h-screen flex items-center justify-center p-4 font-sans">
    <div className="w-full max-w-4xl">
    <Card className="app-container">
    <style>{`
      .app-container {
        padding: 2rem;
        background: white;
        color: black;
        font-family: sans-serif;
      }

      .section-title {
        font-size: 1.875rem;
        font-weight: bold;
      }

      .status-note {
        font-size: 0.875rem;
        color: #6b7280;
      }

      .status-card {
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .status-card h2 {
        font-size: 1.5rem;
        font-weight: bold;
        margin: 0;
      }

      .uptime-chart {
        display: flex;
        gap: 2px;
        margin-top: 1rem;
      }

      .uptime-bar {
        flex-grow: 1;
        height: 3rem;
        border-radius: 4px;
      }

      .bar-up {
        background: black;
      }

      .bar-down {
        background: #d1d5db;
      }

      .uptime-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }

      .uptime-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        background: white;
        padding: 1rem;
        border-radius: 0.5rem;
      }

      .uptime-box span:first-child {
        font-size: 1.5rem;
        font-weight: bold;
      }

      .uptime-box span:last-child {
        font-size: 0.875rem;
        color: #6b7280;
      }

      .event-section {
        padding: 1.5rem;
        border-radius: 1rem;
      }

      .event-entry {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .event-details p {
        margin: 0.25rem 0;
        font-size: 0.875rem;
        color: #4b5563;
      }

      .event-details p:first-child {
        font-weight: 500;
        color: black;
      }


    `}</style>

    <div style={{display:"flex", flexDirection:"row", alignItems:"center"}}>
      <div style={{ display: 'flex', flexDirection: 'column' , flex: 1}}>
        <div className="section-title">Service Status {app.status}</div>
        <div className="status-note">Last updated 1 minute ago. Next update in 15 sec.</div>
      </div>
      {onRefresh && (
        <Button 
          style={{width: "100px"}} 
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Clock className="h-4 w-4" />
              <div>Update</div>
            </>
          )}
        </Button>
      )}
    </div>

    <div className="status-card">
      <div>
        <img src={app.logo} alt={`${app.name} logo`} className="w-25 h-25 rounded-[15px]" />
      </div>
      <div style={{flex: 1}}>
        <h2>{app.name}</h2>
        <p className="status-note">Submitted on {app.submitted}</p>
        <p className="status-note">{app.packageName || 'N/A'}</p>

      </div>
      <div style={{display: 'flex', flexDirection: 'row', gap: '1.0rem', justifyContent: "center", alignItems:"center"}}>
        {app.status.toLowerCase() === 'online' ? (
          <CheckCircle size={48} color='green'/>
        ) : (
          <XCircle size={48} color='red'/>
        )}
        <div>
          <h2>{app.status.toLowerCase() === 'online' ? 'All systems operational' : 'System experiencing issues'}</h2>
          <p className="status-note">
            {app.status.toLowerCase() === 'online' 
              ? `` 
              : `Current status: ${app.status} - Check events below`}
          </p>
        </div>
      </div>
      
    </div>

    {/* App Uptime Chart */}
    <AppUptimeChart appItems={appItems} onDaySelection={handleDaySelection} />
    
    

    {(app.details.events.length > 0 || dayFilterState.selectedDayItems.length > 0) && (
      <div className="event-section">
        <h3 className="section-title">
          Problems
          {dayFilterState.selectedDay && (
            <span className="text-sm font-normal text-gray-600 ml-2">
              - Day {dayFilterState.selectedDay}, {new Date(dayFilterState.currentYear, dayFilterState.currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
          )}
        </h3>
        
        {/* Show selected day unhealthy items if a day is selected */}
        {dayFilterState.selectedDay && dayFilterState.selectedDayItems.length > 0 ? (
          dayFilterState.selectedDayItems
            .filter(item => item.health !== 'healthy' && !item.onlineStatus)
            .map((item, index) => (
              <div key={index} className="event-entry">
                <AlertCircle size={20} className="icon" />
                <div className="event-details">
                  <p>{item.packageName} - Unhealthy Status</p>
                  <p>{new Date(item.timestamp).toLocaleString()}</p>
                  <p><strong>Health:</strong> {item.health}</p>
                  <p><strong>Online Status:</strong> {item.onlineStatus ? 'Online' : 'Offline'}</p>
                </div>
              </div>
            ))
        ) : dayFilterState.selectedDay && dayFilterState.selectedDayItems.length === 0 ? (
          <div className="event-entry">
            <div className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-600">✓</span>
            </div>
            <div className="event-details">
              <p>No issues found for this day</p>
              <p>All systems were operational</p>
            </div>
          </div>
        ) : (
          // Show general app events when no day is selected
          app.details.events.map((event, index) => (
            <div key={index} className="event-entry">
              {/* <AlertCircle size={20} className="icon" />
              <div className="event-details">
                <p>{app.name} was down for {event.duration} minutes</p>
                <p>{event.date}, 19:44</p>
                <p><strong>Reason:</strong> {event.reason}</p>
                <p><strong>Details:</strong> {event.details}</p>
              </div> */}
            </div>
          ))
        )}
      </div>
    )}
  </Card>
    </div>
  </div>
  );
};

// App Uptime Chart Component with Month Navigation
interface AppUptimeChartProps {
  appItems: AppBatchItem[];
  onMonthYearChange?: (month: number, year: number) => void
  setMonthNumberDynamic?: (monthName: number) => void
  setYearNumber?: (yearNumber: number) => void
  currentMonth?: number;
  onDaySelection?: (day: number | null, items: AppBatchItem[], month: number, year: number) => void;
}

const AppUptimeChart: React.FC<AppUptimeChartProps> = ({ appItems, onMonthYearChange, setMonthNumberDynamic, setYearNumber, onDaySelection }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedDayItems, setSelectedDayItems] = useState<AppBatchItem[]>([]);

  // Get current month and year
  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  // Calculate days in current month
  const daysInMonth = new Date(year, currentDate.getMonth() + 1, 0).getDate();

  // Handle day selection from streak bar
  const handleDayClick = (day: number, itemsForDay: AppBatchItem[]) => {
    setSelectedDay(day);
    setSelectedDayItems(itemsForDay);
    if (onDaySelection) {
      onDaySelection(day, itemsForDay, currentDate.getMonth(), currentDate.getFullYear());
    }
  };

  // Navigate to previous month
  const handlePreviousMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
    // Reset day selection when changing months
    setSelectedDay(null);
    setSelectedDayItems([]);
  };

  // Navigate to next month
  const handleNextMonth = () => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
    // Reset day selection when changing months
    setSelectedDay(null);
    setSelectedDayItems([]);
  };

  // Calculate uptime percentage from appItems
  const calculateUptimePercentage = () => {
    if (!appItems || appItems.length === 0) return 0;

    // Get items from current month
    const currentMonthItems = appItems.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate.getMonth() === currentDate.getMonth() && 
             itemDate.getFullYear() === currentDate.getFullYear();
    });

    if (currentMonthItems.length === 0) return 0;

    const upItems = currentMonthItems.filter(item => 
      item.onlineStatus === true || item.health === 'healthy'
    );

    return ((upItems.length / currentMonthItems.length) * 100).toFixed(1);
  };

  const uptimePercentage = calculateUptimePercentage();

  return (
    <div style={{borderRadius: "0.5rem", marginTop: "1.5rem", padding: "1rem"}}>
      <div className="flex flex-row items-center justify-between relative mb-4">
        <div className="text-[22px] font-bold ">{monthName} {year}</div>
        <div>
          <Button
          variant="outline"
          size="icon"
          className=" left-1 w-7 h-7 bg-transparent p-0 opacity-50 transition-opacity duration-200 ease-out border-0 hover:opacity-100"
          onClick={handlePreviousMonth}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
          variant="outline"
          size="icon"
          className="right-1 w-7 h-7 bg-transparent p-0 opacity-50 transition-opacity duration-200 ease-out border-0 hover:opacity-100"
          onClick={handleNextMonth}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
      </div>
      <div style={{display:"flex", flexDirection:"row", gap: "2px", justifyContent: "space-between", alignItems: "center"}}>
        <UptimeStreakBar 
          appItems={appItems} 
          dayCount={daysInMonth} 
          title="Daily Status Overview" 
          barWidth="w-4.5"
          barHeight="h-10"
          containerWidth="w-full"
          containerHeight="h-auto"
          currentMonth={currentDate.getMonth()}
          currentYear={currentDate.getFullYear()}
          selectedDay={selectedDay}
          onDayClick={handleDayClick}
        />
        <div style={{fontSize: "1.00rem", fontWeight: "bold", marginLeft: "1rem", color:"grey"}}>
          Uptime: {uptimePercentage}%
        </div>
      </div>
    </div>
  );
};





