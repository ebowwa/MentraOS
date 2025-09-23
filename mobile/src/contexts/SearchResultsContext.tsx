import React, {createContext, useContext, useState} from "react"

// Define the shape of the context
interface SearchResultsContextType {
  searchResults: SearchResultDevice[]
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResultDevice[]>>
}

export class SearchResultDevice {
  deviceMode: string
  deviceName: string
  deviceAddress: string
  constructor(deviceMode: string, deviceName: string, deviceAddress: string) {
    this.deviceMode = deviceMode
    this.deviceName = deviceName
    this.deviceAddress = deviceAddress
  }
}

// Create the context
const SearchResultsContext = createContext<SearchResultsContextType | undefined>(undefined)

// Create a provider component
export const SearchResultsProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [searchResults, setSearchResults] = useState<SearchResultDevice[]>([]) // Shared state

  return (
    <SearchResultsContext.Provider value={{searchResults, setSearchResults}}>{children}</SearchResultsContext.Provider>
  )
}

// Create a custom hook to use the context
export const useSearchResults = (): SearchResultsContextType => {
  const context = useContext(SearchResultsContext)
  if (!context) {
    throw new Error("useSearchResults must be used within a SearchResultsProvider")
  }
  return context
}
