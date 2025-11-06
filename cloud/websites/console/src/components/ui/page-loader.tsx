import React from "react"

const PageLoader: React.FC = () => {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  )
}

export default PageLoader
