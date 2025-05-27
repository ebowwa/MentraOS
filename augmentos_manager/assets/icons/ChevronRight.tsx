import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ChevronRightProps {
  color?: string;
}

const ChevronRight = ({ color = '#fff' }: ChevronRightProps) => (
  <Svg width="25" height="25" viewBox="0 0 25 25" fill="none">
<Path d="M9.09998 18.4766L15.1 12.4766L9.09998 6.47656" stroke="#898FB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</Svg>

);

export default ChevronRight;