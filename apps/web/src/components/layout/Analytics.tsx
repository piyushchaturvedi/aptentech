import Script from 'next/script';

/**
 * Analytics.
 *
 * Loaded only when an admin has configured a measurement ID and switched it on, so the
 * site ships zero third-party JavaScript by default — the source had none, and adding an
 * always-on tag would be a performance regression rather than a migration.
 *
 * `afterInteractive` keeps the tag off the critical path. Conversion events are reported
 * through `trackEvent` below, which is a no-op when analytics is disabled, so call sites
 * never need to check.
 */
export function Analytics({
  config,
}: {
  config: { gaMeasurementId: string; gtmContainerId: string; enabled: boolean };
}) {
  if (!config?.enabled) return null;

  const { gaMeasurementId, gtmContainerId } = config;

  if (gtmContainerId) {
    return (
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmContainerId}');`}
      </Script>
    );
  }

  if (gaMeasurementId) {
    return (
      <>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          strategy="afterInteractive"
        />
        <Script id="ga" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${gaMeasurementId}',{anonymize_ip:true});`}
        </Script>
      </>
    );
  }

  return null;
}
