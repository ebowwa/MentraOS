import React, { useState } from 'react';
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
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(selectedYear - 1);
      } else {
        setSelectedMonth(selectedMonth - 1);
      }
    } else {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(selectedYear + 1);
      } else {
        setSelectedMonth(selectedMonth + 1);
      }
    }
  };

  const getMonthDays = (month: number, year: number) => {
    const monthName = MONTH_NAMES[month].toLowerCase();
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    
    if (monthName === 'february' && isLeapYear) {
      return monthDays.februaryLeap;
    }
    return monthDays[monthName as keyof typeof monthDays] || 30;
  };

  const daysInMonth = getMonthDays(selectedMonth, selectedYear);
  const monthName = MONTH_NAMES[selectedMonth];
  
  // Generate uptime history for the month based on app status
  const generateMonthlyUptime = () => {
    const days = [];
    for (let i = 0; i < daysInMonth; i++) {
      if (appStatus.status === 'Online') {
        // Online apps have mostly up days with occasional downtime
        days.push(Math.random() > 0.02 ? 'up' : 'down');
      } else {
        // Offline apps have more recent downtime
        if (i > daysInMonth - 3) {
          days.push('down');
        } else {
          days.push(Math.random() > 0.1 ? 'up' : 'down');
        }
      }
    }
    return days;
  };

  const monthlyUptime = generateMonthlyUptime();

  return (
    <div className="overall-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 className="section-title">Uptime - {monthName} {selectedYear}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigateMonth('prev')}
            style={{ padding: '0.25rem' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigateMonth('next')}
            style={{ padding: '0.25rem' }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Uptime Percentage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <div className="text-sm">Uptime: {appStatus.uptimePercentage.toFixed(1)}%</div>
        <StatusBadge status={appStatus.status} />
      </div>
      
      {/* Monthly Streak Bars */}
      <div style={{ display: 'flex', gap: '2px', overflowX: 'auto' }}>
        {monthlyUptime.map((status, index) => (
          <div
            key={index}
            className={`flex-none w-3.5 h-9 rounded-[2px] ${
              status === 'up' ? 'bg-green-500' : 'bg-red-500'
            }`}
            title={`Day ${index + 1}: ${status === 'up' ? 'Operational' : 'Downtime'}`}
          />
        ))}
      </div>
      
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
        <span>Day 1</span>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <div className="w-2 h-2 bg-green-500 rounded-sm"></div>
            <span>Up</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <div className="w-2 h-2 bg-red-500 rounded-sm"></div>
            <span>Down</span>
          </div>
        </div>
        <span>Day {daysInMonth}</span>
      </div>
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
  <Card className="app-container">
    <style>{`
      .app-container {
        padding: 2rem;
        background: white;
        color: black;
        font-family: sans-serif;
        min-height: 100vh;
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

      .overall-section {
        background: #f5f5f5;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
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
);





