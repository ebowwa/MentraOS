"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/libs/utils"
import { Button } from "@/components/ui/button"

interface DatePickerProps {
  className?: string
  initialMonth?: number
  initialYear?: number
  onMonthYearChange?: (month: number, year: number) => void
  setMonthNumberDynamic?: (monthName: number) => void
  setYearNumber?: (yearNumber: number) => void
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export function DatePicker({ 
  className, 
  initialMonth, 
  initialYear, 
  onMonthYearChange,
  setMonthNumberDynamic,
  setYearNumber
}: DatePickerProps) {
  const currentDate = new Date()
  const [month, setMonth] = React.useState(initialMonth ?? currentDate.getMonth())
  const [year, setYear] = React.useState(initialYear ?? currentDate.getFullYear())
    
  const handlePreviousMonth = () => {
    let newMonth = month - 1
    let newYear = year

    if (newMonth < 0) {
      newMonth = 11
      newYear = year - 1
    }

    setMonth(newMonth)
    setYear(newYear)
    setMonthNumberDynamic?.(newMonth)
    setYearNumber?.(newYear)
    onMonthYearChange?.(newMonth, newYear)
  }

  const handleNextMonth = () => {
    let newMonth = month + 1
    let newYear = year

    if (newMonth > 11) {
      newMonth = 0
      newYear = year + 1
    }

    setMonth(newMonth)
    setYear(newYear)
    setMonthNumberDynamic?.(newMonth)
    setYearNumber?.(newYear)
    onMonthYearChange?.(newMonth, newYear)
  }

  React.useEffect(() => {
    if (initialMonth !== undefined) {
        setMonth(initialMonth)
        setMonthNumberDynamic?.(initialMonth)
    }

    if (initialYear !== undefined) {
        setYear(initialYear)
        setYearNumber?.(initialYear)
    }
  }, [initialMonth, initialYear, setMonthNumberDynamic, setYearNumber])

  return (
    <div className={cn("flex bg-white rounded-[10px]", className)}>
      <div className="flex justify-center items-center relative w-[200px]">
        <Button
          variant="outline"
          size="icon"
          className="absolute left-1 w-7 h-7 bg-transparent p-0 opacity-50 transition-opacity duration-200 ease-out border-0 hover:opacity-100"
          onClick={handlePreviousMonth}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="text-sm font-medium">
          {MONTHS[month]} {year}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="absolute right-1 w-7 h-7 bg-transparent p-0 opacity-50 transition-opacity duration-200 ease-out border-0 hover:opacity-100"
          onClick={handleNextMonth}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
