import React, { useState, useMemo } from 'react';
import { CheckCircle, AlertCircle, XCircle, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Month navigation constants
const monthDays = {
  january: 31,
  february: 28,
  februaryLeap: 29,
  march: 31,
  april: 30,
  may: 31,
  june: 30,
  july: 31,
  august: 31,
  september: 30,
  october: 31,
  november: 30,
  december: 31
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Define the data structures using TypeScript interfaces
interface UptimeEvent {
  date: string;
  duration: number; // in minutes
  reason: string;
  details: string;
}

interface DayStatus {
  day: number;
  status: 'up' | 'down' | 'maintenance';
}

interface UptimeBarProps {
  day: DayStatus;
  onHover: (day: number | null) => void;
}

interface AppStatus {
  id: string;
  name: string;
  logo: string; // Placeholder for SVG or emoji
  packageName?: string; // Optional, if needed
  submitted: string;
  uptimePercentage: number;
  status: 'Online' | 'Offline';
  uptimeHistory: string[]; // 'up' for up, 'down' for down
  details: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    events: UptimeEvent[];
  };
}

// Mock data for a single app
const mockApp: AppStatus = {
  id: 'app-1',
  name: 'Slack Dev Local',
  logo: 'https://placehold.co/40x40/000000/ffffff?text=SL',
  submitted: 'Aug 4, 2025, 12:59 PM',
  uptimePercentage: 100.00,
  status: 'Online',
  uptimeHistory: Array(30).fill('up'), // 90 days of uptime
  details: {
    last24h: 100,
    last7d: 99.952,
    last30d: 99.984,
    last90d: 99.970,
    events: [
      { date: 'July 18, 2025', duration: 19, reason: 'Connection Timeout', details: 'The response took so long that the connection timed out.' },
    ],
  },
};

// Generate random uptime data for a given month and year
const generateMonthData = (date: Date): DayStatus[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data: DayStatus[] = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const random = Math.random();
    let status: 'up' | 'down' | 'maintenance';
    if (random < 0.05) { // 5% chance of being down
      status = 'down';
    } else if (random < 0.08) { // 3% chance of maintenance
      status = 'maintenance';
    } else { // 92% chance of being up
      status = 'up';
    }
    data.push({ day: i, status });
  }
  return data;
};

// UptimeBar Component
const UptimeBar: React.FC<UptimeBarProps> = ({ day, onHover }) => {
  const statusStyles = {
    up: 'bg-green-500 hover:bg-green-400',
    down: 'bg-red-500 hover:bg-red-400',
    maintenance: 'bg-yellow-500 hover:bg-yellow-400',
  };

  return (
    <div 
      className="relative flex-1 group"
      onMouseEnter={() => onHover(day.day)}
      onMouseLeave={() => onHover(null)}
    >
      <div className={`h-10 rounded-sm transition-all duration-200 ease-in-out cursor-pointer ${statusStyles[day.status]}`}></div>
      <div className="absolute bottom-full mb-2 w-max left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        Day {day.day}: <span className="font-semibold capitalize">{day.status}</span>
      </div>
    </div>
  );
};

// Legend Component
const Legend: React.FC = () => (
  <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-gray-500 mt-4">
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-green-500"></div>
      <span>Up</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
      <span>Maintenance</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-red-500"></div>
      <span>Down</span>
    </div>
  </div>
);

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

// Combined Monthly Uptime Component
interface MonthlyUptimeProps {
  appStatus: AppStatus;
  currentMonth?: number;
  currentYear?: number;
}

const MonthlyUptimeChart: React.FC<MonthlyUptimeProps> = ({ 
  appStatus, 
  currentMonth = new Date().getMonth(), 
  currentYear = new Date().getFullYear() 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date(`${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-01T00:00:00`));
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Generate data for the current month. useMemo prevents re-generating on every render.
  const monthData = useMemo(() => generateMonthData(currentDate), [currentDate]);

  // Function to change the month
  const changeMonth = (offset: number) => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
  };

  // Calculate overall uptime percentage
  const upDays = monthData.filter(d => d.status === 'up').length;
  const totalDays = monthData.length;
  const uptimePercentage = ((upDays / totalDays) * 100).toFixed(1);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const navigateMonth = (direction: 'prev' | 'next') => {
    changeMonth(direction === 'prev' ? -1 : 1);
  };

  return (
    <div className="bg-white rounded-xl  p-6 sm:p-8">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Uptime - {monthName} {year}</h1>
        <div className="flex items-center gap-2 mt-3 sm:mt-0">
          <button 
            onClick={() => navigateMonth('prev')}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button 
            onClick={() => navigateMonth('next')}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="text-lg font-semibold text-gray-700">
          Uptime: <span className="text-blue-600">{uptimePercentage}%</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${parseFloat(uptimePercentage) > 95 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="font-medium text-gray-600">
            {parseFloat(uptimePercentage) > 95 ? 'Excellent' : 'Action Required'}
          </span>
        </div>
      </div>

      {/* Uptime Bars Section */}
      <div>
        <div className="flex gap-1">
          {monthData.map(day => (
            <UptimeBar key={day.day} day={day} onHover={setHoveredDay} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>Day 1</span>
          <span>Day {totalDays}</span>
        </div>
      </div>

      {/* Legend Section */}
      <Legend />
    </div>
  );
};

// Component for the detailed view of a single app


interface AppDetailViewProps {
  app: AppStatus;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}



export const AppDetailView: React.FC<AppDetailViewProps> = ({ app, onRefresh, isRefreshing = false }) => (
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
        margin-top: 2rem;
        background: #f5f5f5;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
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
              ? `Uptime: ${app.uptimePercentage.toFixed(2)}%` 
              : `Current status: ${app.status} - Check events below`}
          </p>
        </div>
      </div>
      
    </div>

    <MonthlyUptimeChart appStatus={app} />

    {app.details.events.length > 0 && (
      <div className="event-section">
        <h3 className="section-title">Status updates</h3>
        {app.details.events.map((event, index) => (
          <div key={index} className="event-entry">
            <AlertCircle size={20} className="icon" />
            <div className="event-details">
              <p>{app.name} was down for {event.duration} minutes</p>
              <p>{event.date}, 19:44</p>
              <p><strong>Reason:</strong> {event.reason}</p>
              <p><strong>Details:</strong> {event.details}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </Card>
    </div>
  </div>
);





