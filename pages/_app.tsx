import type { AppProps } from "next/app";
import Head from "next/head";
import NavBar from "@/components/NavBar";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  const name = process.env.NEXT_PUBLIC_AGENT_NAME || "AI 에이전트";
  const desc =
    process.env.NEXT_PUBLIC_AGENT_DESC ||
    "Copilot Studio 에이전트와 음성으로 대화하세요.";

  return (
    <>
      <Head>
        <title>{name}</title>
        <meta name="description" content={desc} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <NavBar />
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <Component {...pageProps} />
      </main>
      <footer className="py-8 text-center text-xs text-slate-400">
        Powered by Copilot Studio · Direct Line
      </footer>
    </>
  );
}
