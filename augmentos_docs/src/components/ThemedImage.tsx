import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';

export default function AugmentOSArchImage({
  width = 500,
  className = '',
}) {
  const lightImage = useBaseUrl('/img/augmentos-arch-light.png');
  const darkImage = useBaseUrl('/img/augmentos-arch-dark.png');

  return (
    <ThemedImage
      alt="AugmentOS Architecture"
      sources={{
        light: lightImage,
        dark: darkImage,
      }}
      style={{ width: width }}
      className={className}
    />
  );
}