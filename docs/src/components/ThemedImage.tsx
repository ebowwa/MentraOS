import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';

export default function MentraOSArchImage({
  width = 500,
  className = '',
}) {
  const lightImage = useBaseUrl('/img/mentraos-arch-light.png');
  const darkImage = useBaseUrl('/img/mentraos-arch-dark.png');

  return (
    <div style={{ textAlign: 'center', margin: '20px 0' }}>
      <ThemedImage
        alt="MentraOS Architecture"
        sources={{
          light: lightImage,
          dark: darkImage,
        }}
        style={{ maxWidth: `${width}px` }}
        className={className}
      />
    </div>
  );
}