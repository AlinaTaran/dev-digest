/** The slice of `RequestContext` the eval service needs (avoids importing the route layer). */
export interface RequestContextLike {
  workspaceId: string;
}
