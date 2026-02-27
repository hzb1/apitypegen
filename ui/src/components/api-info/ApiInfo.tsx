import "./ApiInfo.css";
import CodeCard from "../code-card/CodeCard.tsx";
import type { ApiDetail } from "../../../types.ts";

type ApiInfoProps = {
  api: ApiDetail;
  codeMap?: {
    "Request Function": string;
    Models: string;
    "Query Params": string;
    "Request Body": string;
    "Response Data": string;
  };
};

const ApiInfo = ({ api, codeMap }: ApiInfoProps) => {
  // 标题
  const title = api?.operation?.summary;

  // 描述
  // const description = api?.description || "";

  return (
    <>
      <div
        className={
          "flex flex-col box-border w-full relative grow mx-auto [contain:inline-size] pb-20"
        }
      >
        <header className={"relative"}>
          {/*<div className={'mt-0.5 space-y-2.5'}>*/}
          {/*  <div className={'eyebrow h-5 text-primary dark:text-primary-light text-sm font-semibold'}>对话消息</div>*/}
          {/*</div>*/}
          <div
            className={
              "flex flex-col sm:flex-row items-start sm:items-center relative gap-2 min-w-0"
            }
          >
            <h1
              className={
                "text-2xl sm:text-3xl text-gray-900 tracking-tight dark:text-gray-200 [overflow-wrap:anywhere] break-all font-semibold"
              }
            >
              {title}
            </h1>
          </div>

          {/*<div className={'mt-2 text-lg prose prose-gray dark:prose-invert [&>*]:[overflow-wrap:anywhere]'}>*/}
          {/*  <p>{description}</p>*/}
          {/*</div>*/}
        </header>

        <div className={"flex flex-col gap-8 isolate"}>
          <div className={"mt-6 flex w-full flex-col space-y-4"}>
            <div
              className={
                "flex w-full flex-col bg-background-light dark:bg-background-dark border-standard rounded-2xl p-1.5"
              }
            >
              <div className="flex items-center space-x-1.5">
                <div className="relative flex-1 flex gap-2 min-w-0 rounded-xl items-center cursor-pointer p-1.5 pr-0 overflow-hidden border-standard">
                  <div className="method-pill rounded-lg font-bold px-1.5 py-0.5 text-sm leading-5 bg-blue-400/20 dark:bg-blue-400/20 text-blue-700 dark:text-blue-400">
                    {api.method}
                  </div>
                  <div className="flex items-center space-x-2 overflow-x-auto flex-1 no-scrollbar">
                    <div className="group flex items-center flex-1 gap-0.5 font-mono pr-1.5">
                      <div className="absolute right-0 p-2 bg-background-light dark:bg-background-dark rounded-lg hidden group-hover:block">
                        <svg
                          className="w-4 h-4 bg-gray-400 dark:bg-white/30"
                          style={{
                            maskImage:
                              "url(&quot;https://d3gk2c5xim1je2.cloudfront.net/v7.1.0/regular/clone.svg&quot;)",
                            maskRepeat: "no-repeat",
                            maskPosition: "center center",
                          }}
                        ></svg>
                      </div>
                      <div className={"flex items-center"}>
                        <div
                          className={
                            "text-sm font-medium text-gray-800 dark:text-white min-w-max"
                          }
                        >
                          {api.path}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  className="tryit-button flex items-center justify-center px-3 h-9 font-medium rounded-xl mouse-pointer hover:opacity-80 gap-1.5 bg-[#3064E3] text-[#FFFFFF] cursor-pointer"
                >
                  <span>试一试</span>
                  <svg
                    className="w-3 h-3 bg-white"
                    style={{
                      maskImage:
                        "url(&quot;https://d3gk2c5xim1je2.cloudfront.net/v7.1.0/solid/play.svg&quot;)",
                      maskRepeat: "no-repeat",
                      maskPosition: "center center",
                    }}
                  ></svg>
                </button>
              </div>
            </div>
          </div>

          <CodeCard title={"Query Params"} code={codeMap?.["Query Params"]} />
          <CodeCard title={"Request Body"} code={codeMap?.["Request Body"]} />
          <CodeCard title={"Response Data"} code={codeMap?.["Response Data"]} />
        </div>
      </div>
    </>
  );
};

export default ApiInfo;
