export type Note = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
};

/** 当前登录用户 */
export type AuthUser = {
  id: string;
  username: string;
};

export type TagCount = {
  name: string;
  count: number;
};

export type Draft = {
  title: string;
  body: string;
  tags: string[];
};
