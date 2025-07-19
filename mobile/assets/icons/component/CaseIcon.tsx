import React from "react"
import {SvgXml} from "react-native-svg"

interface CaseIconProps {
  size?: number
  color?: string
  isCharging?: boolean
  isDark?: boolean
}

export const CaseIcon = ({size = 24, color, isCharging = false, isDark = false}: CaseIconProps) => {
  // SVG content as string - this is the case icon SVG
  const caseSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 16.125L10.5 16.125L10.5 17.625L3 17.625L3 16.125Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 4.875L21 4.875L21 6.375L3 6.375L3 4.875Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M3 13.125L10.5 13.125L10.5 14.625L3 14.625L3 13.125Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="1.5" y="6.375" width="1.5" height="9.75" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="21" y="6.375" width="1.5" height="4.5" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="10.5" y="10.125" width="3" height="1.5" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 12.375H21V13.875H13.5V12.375Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 13.875H21V17.625H13.5V13.875Z" fill="${isCharging ? "#FEF991" : color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M13.5 17.625H21V19.125H13.5V17.625Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M21 13.875H22.5V17.625H21V13.875Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<path d="M22.5 14.625H23.25V16.875H22.5V14.625Z" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
<rect x="12" y="13.875" width="1.5" height="3.75" fill="${color || (isDark ? "#D3D3D3" : "#232323")}"/>
</svg>`

  return <SvgXml xml={caseSvg} width={size} height={size} />
}
