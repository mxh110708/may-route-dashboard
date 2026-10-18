import { lazy, Suspense } from "react";

import { Spinner } from "./ui";
import styles from "./GitHubMarkdown.module.css";

const Content = lazy(() => import("./GitHubMarkdownContent").then(module => ({ default: module.GitHubMarkdown })));

export function GitHubMarkdown(props: { text: string }) {
  return <Suspense fallback={<div className={styles.markdown} aria-busy="true"><Spinner /></div>}>
    <Content {...props} />
  </Suspense>;
}
