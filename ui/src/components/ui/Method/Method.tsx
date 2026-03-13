import clsx from "clsx";

const getTagColor = (method: string, isActive: boolean) => {
  const methodUpperCase = method.toUpperCase();
  if (methodUpperCase === "GET") {
    return isActive
      ? "method-tag method-tag-get active"
      : "method-tag method-tag-get";
  } else if (methodUpperCase === "POST") {
    return isActive
      ? "method-tag method-tag-post active"
      : "method-tag method-tag-post";
  } else if (methodUpperCase === "PUT") {
    return isActive
      ? "method-tag method-tag-put active"
      : "method-tag method-tag-put";
  } else if (methodUpperCase === "DELETE") {
    return isActive
      ? "method-tag method-tag-delete active"
      : "method-tag method-tag-delete";
  }

  return isActive ? "method-tag method-tag-default active" : "method-tag method-tag-default";
};

const methodTextMap: Record<string, string> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DEL"
};

const Method = ({
                  method,
                  className,
                  isActive
                }: {
  method: string;
  className?: string;
  isActive: boolean;
}) => {
  const methodUpperCase = method.toUpperCase();

  const tagColor = getTagColor(method, isActive);
  const methodText = methodTextMap[methodUpperCase] ?? methodUpperCase;
  return (
    <div
      className={clsx(
        "px-1 py-0.5 rounded-md text-[0.58rem] leading-tight font-bold w-10 text-center",
        tagColor,
        className
      )}
    >
      {methodText}
    </div>
  );
};

export default Method;
