import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type ShoppingHeaderConfig =
  | { variant: 'product'; _id: symbol; title: string; shopName: string; onBack: () => void; onShare?: () => void; onCart?: () => void; onSearch?: () => void }
  | { variant: 'nav'; _id: symbol; title: string; onBack: () => void };

export type ShoppingHeaderContextValue = {
  config: ShoppingHeaderConfig | null;
  setConfig: (next: ShoppingHeaderConfig | null | ((prev: ShoppingHeaderConfig | null) => ShoppingHeaderConfig | null)) => void;
};

export const ShoppingHeaderContext =
  React.createContext<ShoppingHeaderContextValue | null>(null);

export const useShoppingNavHeader = (title: string, onBack: () => void) => {
  const ctx = React.useContext(ShoppingHeaderContext);
  const setConfig = ctx?.setConfig;
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;
  const idRef = React.useRef(Symbol('shopping-nav'));

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      const id = idRef.current;
      setConfig({ variant: 'nav', _id: id, title, onBack: () => onBackRef.current() });
      return () => setConfig((prev) => (prev?._id === id ? null : prev));
    }, [setConfig, title]),
  );
};

export const useShoppingProductHeader = (args: {
  shopName: string;
  onBack: () => void;
  onShare?: () => void;
  onCart?: () => void;
  onSearch?: () => void;
}) => {
  const ctx = React.useContext(ShoppingHeaderContext);
  const setConfig = ctx?.setConfig;
  const { shopName, onBack, onShare, onCart, onSearch } = args;
  const onBackRef = React.useRef(onBack);
  const onShareRef = React.useRef(onShare);
  const onCartRef = React.useRef(onCart);
  const onSearchRef = React.useRef(onSearch);
  onBackRef.current = onBack;
  onShareRef.current = onShare;
  onCartRef.current = onCart;
  onSearchRef.current = onSearch;
  const idRef = React.useRef(Symbol('shopping-product'));

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      const id = idRef.current;
      setConfig({
        variant: 'product',
        _id: id,
        title: 'Chi tiết sản phẩm',
        shopName,
        onBack: () => onBackRef.current(),
        onShare: () => onShareRef.current?.(),
        onCart: () => onCartRef.current?.(),
        onSearch: () => onSearchRef.current?.(),
      });
      return () => setConfig((prev) => (prev?._id === id ? null : prev));
    }, [setConfig, shopName]),
  );
};
