import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, XCircle, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UptimeStreakBar } from '@/components/ui/upTimeStreakBar';
import { DatePicker } from '@/components/ui/date-picker';

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
  startUptimeMonth: number;
  startUptimeYear: number;
}



const AppDetailView: React.FC<AppDetailViewProps> = ({  app, startUptimeMonth, startUptimeYear, onRefresh, isRefreshing = false, appItems, selectedDay, selectedDayItems, currentMonth, currentYear }) => {
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
  <div className="  flex   p-4 font-sans">
    <div className="w-full max-w-4xl">
    <Card className="p-8 bg-white text-black font-sans">

    <div className="flex flex-row items-center">
      <div className="flex flex-col flex-1">
        <div className="text-3xl font-bold">Service Status {app.status}</div>
        <div className="text-sm text-gray-500">Last updated 1 minute ago. Next update in 15 sec.</div>
      </div>
      {onRefresh && (
        <Button 
          className="w-[100px]" 
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

    <div className="p-6 rounded-2xl shadow-sm flex items-center gap-4">
      <div>
        <img src={app.logo} alt={`${app.name} logo`} className="w-25 h-25 rounded-[15px]" />
      </div>
      <div className="flex-1">
        <h2 className="text-2xl font-bold m-0">{app.name}</h2>
        <p className="text-sm text-gray-500">Submitted on {app.submitted}</p>
        <p className="text-sm text-gray-500">{app.packageName || 'N/A'}</p>

      </div>
      <div className="flex flex-row gap-4 justify-center items-center">
        {app.status.toLowerCase() === 'online' ? (
          <CheckCircle size={48} color='green'/>
        ) : (
          <XCircle size={48} color='red'/>
        )}
        <div>
          <h2 className="text-2xl font-bold m-0">{app.status.toLowerCase() === 'online' ? 'All systems operational' : 'System experiencing issues'}</h2>
          <p className="text-sm text-gray-500">
            {app.status.toLowerCase() === 'online' 
              ? `` 
              : `Current status: ${app.status} - Check events below`}
          </p>
        </div>
      </div>
      
    </div>

    {/* App Uptime Chart */}
    <AppUptimeChart startUptimeMonth={startUptimeMonth} startUptimeYear={startUptimeYear} appItems={appItems} onDaySelection={handleDaySelection} />

    {(app.details.events.length > 0 || dayFilterState.selectedDayItems.length > 0) && (
      <div className="p-6 rounded-2xl">
        <h3 className="text-3xl font-bold">
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
              <div key={index} className="flex gap-4 mb-6">
                <AlertCircle size={20} className="icon" />
                <div className="space-y-1">
                  <p className="font-medium text-black">{item.packageName} - Unhealthy Status</p>
                  <p className="text-sm text-gray-600">{new Date(item.timestamp).toLocaleString()}</p>
                  <p className="text-sm text-gray-600"><strong>Health:</strong> {item.health}</p>
                  <p className="text-sm text-gray-600"><strong>Online Status:</strong> {item.onlineStatus ? 'Online' : 'Offline'}</p>
                </div>
              </div>
            ))
        ) : dayFilterState.selectedDay && dayFilterState.selectedDayItems.length === 0 ? (
          <div className="flex gap-4 mb-6">
            <div className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-600">✓</span>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-black">No issues found for this day</p>
              <p className="text-sm text-gray-600">All systems were operational</p>
            </div>
          </div>
        ) : (
          // Show general app events when no day is selected
          app.details.events.map((event, index) => (
            <div key={index} className="flex gap-4 mb-6">
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
  startUptimeMonth: number;
  startUptimeYear: number;
}

const AppUptimeChart: React.FC<AppUptimeChartProps> = ({ startUptimeMonth, startUptimeYear, appItems, onMonthYearChange, setMonthNumberDynamic, setYearNumber, onDaySelection }) => {
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
    <div className="rounded-lg mt-6 p-4">
      <div className="flex flex-row items-center justify-between relative mb-4">
        <div className="text-[22px] font-bold ">{monthName} {year}</div>
        <div>
          <DatePicker 
            startUptimeMonth={startUptimeMonth} 
            startUptimeYear={startUptimeYear} 
            initialYear={year} 
            initialMonth={currentDate.getMonth()} 
            setMonthNumberDynamic={setMonthNumberDynamic} 
            setYearNumber={setYearNumber} 
          />         
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
      <div className="flex flex-row gap-0.5 justify-between items-center">
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
        <div className="text-base font-bold ml-4 text-gray-500">
          <DatePicker 
            className='w-42 bg-gray-50 h-10.5 rounded-[7px] text-black'
            startUptimeMonth={startUptimeMonth} 
            startUptimeYear={startUptimeYear} 
            initialYear={year} 
            initialMonth={currentDate.getMonth()} 
            setMonthNumberDynamic={setMonthNumberDynamic} 
            setYearNumber={setYearNumber} 
          />  
        </div>
      </div>
    </div>
  );
};


export default AppDetailView;


