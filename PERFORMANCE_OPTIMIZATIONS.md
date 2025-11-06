# Performance Optimizations Summary

This document outlines the performance optimizations applied to the MentraOS codebase to improve bundle sizes, load times, and overall application performance.

## Cloud Websites (Vite)

### Optimizations Applied

#### 1. **Console Website** (`cloud/websites/console/`)
- ✅ **Code Splitting**: Added lazy loading for all page components using React `lazy()` and `Suspense`
- ✅ **Manual Chunking**: Configured optimized manual chunks in Vite config:
  - `vendor`: React core libraries
  - `radix-ui`: UI component library (large, split separately)
  - `forms`: Form libraries (react-hook-form, zod)
  - `auth`: Authentication libraries
  - `utils`: Utility libraries
  - `charts`: Data visualization libraries
  - `shared`: Shared package
- ✅ **Build Optimizations**:
  - Target: `esnext` for modern JavaScript
  - Minification: `esbuild` (faster than terser)
  - Source maps: Disabled in production
  - Chunk size warning limit: 1000KB
- ✅ **Dependency Optimization**: Pre-bundled React and React DOM for faster dev server startup

#### 2. **Store Website** (`cloud/websites/store/`)
- ✅ Enhanced existing manual chunks configuration
- ✅ Added `shared` chunk for better code splitting
- ✅ Added build optimizations (target, minify, sourcemap settings)
- ✅ Already had lazy loading implemented

#### 3. **Account Website** (`cloud/websites/account/`)
- ✅ Added manual chunking configuration
- ✅ Added build optimizations matching other sites

### Performance Impact

**Expected Improvements:**
- **Initial Load Time**: 30-50% reduction due to code splitting
- **Bundle Size**: Smaller initial bundles, larger libraries loaded on-demand
- **Time to Interactive**: Faster due to reduced initial JavaScript parsing
- **Cache Efficiency**: Better browser caching with separate vendor chunks

## Mobile App (React Native / Expo)

### Optimizations Applied

#### 1. **Metro Bundler Configuration** (`mobile/metro.config.js`)
- ✅ Already had `inlineRequires: true` enabled (excellent for performance)
- ✅ Added transformer optimizations
- ✅ Added serializer configuration comments for future optimization

#### 2. **App Startup Optimization** (`mobile/src/app/_layout.tsx`)
- ✅ **Parallel Asset Loading**: Load i18n and date-fns locale in parallel
- ✅ **Deferred WebRTC Initialization**: WebRTC (`@livekit/react-native-webrtc`) no longer blocks app startup
  - WebRTC initialization happens in the background after critical assets load
  - App becomes interactive faster
  - WebRTC loads when actually needed for video/audio features

### Performance Impact

**Expected Improvements:**
- **Time to Interactive**: 20-40% faster due to deferred WebRTC loading
- **Initial Bundle**: No immediate impact (Metro already optimized)
- **Memory Usage**: Slightly better due to parallel loading

## Additional Recommendations

### For Future Optimization

#### 1. **Image Optimization**
- Consider using `expo-image` (already in dependencies) with optimizations:
  ```typescript
  <Image
    source={{ uri: imageUri }}
    cachePolicy="memory-disk"
    placeholder={blurhash}
    transition={200}
  />
  ```
- Enable image compression in build process
- Consider using WebP format for better compression

#### 2. **i18n Lazy Loading** (Mobile)
Currently all language files are loaded upfront. For apps with many languages:
- Load only the current language initially
- Lazy load other languages when needed
- This can save ~50-200KB per additional language

#### 3. **Tree Shaking**
- Ensure all heavy libraries support tree shaking
- Use ES modules imports instead of CommonJS where possible
- Remove unused exports from shared packages

#### 4. **Bundle Analysis**
Recommended tools for monitoring bundle size:
- **Vite**: Use `vite-bundle-visualizer` plugin
- **Metro**: Use `metro-bundle-visualizer` for React Native

#### 5. **Code Splitting Further**
Consider lazy loading:
- Heavy charting libraries (only load when viewing analytics)
- Video players (only load when viewing videos)
- Complex form components (load on navigation)

#### 6. **Service Worker / Offline Support**
For web apps:
- Implement service workers for caching
- Cache vendor chunks aggressively
- Implement offline-first strategies

## Monitoring

### Metrics to Track

1. **Web Performance**
   - First Contentful Paint (FCP)
   - Largest Contentful Paint (LCP)
   - Time to Interactive (TTI)
   - Total Bundle Size
   - Number of JavaScript chunks

2. **Mobile Performance**
   - App startup time
   - Time to Interactive
   - Memory usage
   - Bundle size (iOS/Android)

3. **Bundle Analysis**
   - Run `vite build` and analyze chunks
   - Monitor for chunk size regressions
   - Track unused code

## Testing Recommendations

1. **Load Testing**
   - Test on slow 3G connections
   - Test on low-end devices (mobile)
   - Use Lighthouse for web performance audits

2. **Bundle Size Regression**
   - Set up CI checks for bundle size limits
   - Alert on significant increases (>10%)

3. **Performance Budgets**
   - Set targets:
    - Initial bundle: <200KB (gzipped)
    - Time to Interactive: <3s on 3G
    - First Contentful Paint: <1.5s

## Implementation Date

All optimizations were implemented on: {{DATE}}
- Console app lazy loading and Vite config
- Store and Account Vite config enhancements
- Mobile app startup optimizations

## Notes

- WebRTC deferral may cause slight delay when first accessing video/audio features
- If this becomes an issue, consider pre-initializing WebRTC on user interaction hint
- All changes maintain backward compatibility
