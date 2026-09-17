import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { LazyMotion, m } from "motion/react";
import { Shell } from "./components/Shell";
import { ToastProvider } from "./components/ui/Toast";
import { InvestorProvider } from "./lib/investor-context";
import { ThemeProvider } from "./lib/theme";

// Animation features load after first paint.
const motionFeatures = () =>
  import("./components/ui/motion-features").then((r) => r.default);

// Route-level code splitting: the landing page carries the animation library,
// and app screens shouldn't pay for it.
const Landing = lazy(() => import("./pages/Landing"));
const Overview = lazy(() => import("./pages/Overview"));
const Discover = lazy(() => import("./pages/Discover"));
const StartupDetail = lazy(() => import("./pages/StartupDetail"));
const Feed = lazy(() => import("./pages/Feed"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Model = lazy(() => import("./pages/Model"));
const Submit = lazy(() => import("./pages/Submit"));
const Register = lazy(() => import("./pages/Register"));
const Onboarding = lazy(() => import("./pages/Onboarding"));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-72" />
      <div className="skeleton h-[140px]" />
      <div className="skeleton h-[360px]" />
    </div>
  );
}

/** Each route fades up on entry. Enter-only: an exit animation would hold the
 *  next page back, which reads as slowness in a data tool. */
function RouteFade() {
  const { pathname } = useLocation();
  return (
    <m.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <Outlet />
    </m.div>
  );
}

function AppLayout() {
  return (
    <Shell>
      <Suspense fallback={<PageFallback />}>
        <RouteFade />
      </Suspense>
    </Shell>
  );
}

/** Route changes start at the top of the page, except in-page hash links. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LazyMotion features={motionFeatures}>
          <ToastProvider>
            <InvestorProvider>
              <ScrollToTop />
              <Routes>
                <Route
                  path="/"
                  element={
                    <Suspense
                      fallback={<div className="min-h-screen bg-plane" />}
                    >
                      <Landing />
                    </Suspense>
                  }
                />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Overview />} />
                  <Route path="/discover" element={<Discover />} />
                  <Route path="/startup/:id" element={<StartupDetail />} />
                  <Route path="/feed" element={<Feed />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/model" element={<Model />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/submit" element={<Submit />} />
                  <Route path="/onboarding" element={<Onboarding />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </InvestorProvider>
          </ToastProvider>
        </LazyMotion>
      </ThemeProvider>
    </BrowserRouter>
  );
}
