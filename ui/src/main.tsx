import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

import { createBrowserRouter, RouterProvider } from "react-router";

const router = createBrowserRouter(
  [
    {
      path: "/",
      lazy: async () => {
        const module = await import("./pages/AppRoot.tsx");
        return { Component: module.default };
      },
      children: [
        {
          index: true,
          lazy: async () => {
            const module = await import("./pages/home/Home.tsx");
            return { Component: module.default };
          },
        },
        {
          path: "proxy-fetch",
          lazy: async () => {
            const module = await import("./pages/proxy-fetch/ProxyFetchDemo.tsx");
            return { Component: module.default };
          },
        },
        {
          path: "network",
          lazy: async () => {
            const module = await import("./pages/network/NetworkPanel.tsx");
            return { Component: module.default };
          },
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
