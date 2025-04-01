import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';
import SEOHead from '@site/src/components/Head';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          AugmentOS SDK Docs <sup style={{fontSize: '0.5em', verticalAlign: 'super'}}>beta</sup>
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/intro">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <>
      <SEOHead />
      <Layout
        title={`Welcome to ${siteConfig.title}`}
        description="AugmentOS Developer Documentation - Build applications for the open-source operating system for smart glasses">
      <HomepageHeader />
      <main>
        <div className="container">
          <div className="padding-vert--lg">
            <div className="margin-vert--lg">
              <Heading as="h2">Welcome to AugmentOS Developer Docs</Heading>
              <p>
                This documentation will guide you through building applications for AugmentOS, 
                the open-source operating system for smart glasses.
              </p>
              
              <div className="text--center margin-vert--lg">
                <img 
                  src="/img/augmentos_screenshot.png" 
                  alt="AugmentOS Screenshot" 
                  style={{ maxHeight: '30%', borderRadius: '8px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}
                />
              </div>
              
              <Heading as="h3">Getting Started</Heading>
              <p>
                To begin developing with AugmentOS, set up your environment and explore the SDK.
              </p>
              
              <Heading as="h3">Prerequisites</Heading>
              <p>
                Before you start, ensure you have the following:
              </p>
              <ul>
                <li>Phone running the <a href="https://augmentos.org/install">AugmentOS app</a></li>
                <li><a href="https://augmentos.org/glasses">Compatible pair of smart glasses</a></li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </Layout>
    </>
  );
}