import React from 'react';
import { useFocusEffect } from '@react-navigation/native';

export type ShoppingHeaderConfig =
  | { variant: 'product'; title: string; shopName: string; onBack: () => void; onShare?: () => void; onCart?: () => void; onSearch?: () => void }
  | { variant: 'nav'; title: string; onBack: () => void };

export type ShoppingHeaderContextValue = {
  config: ShoppingHeaderConfig | null;
  setConfig: (next: ShoppingHeaderConfig | null) => void;
};

export const ShoppingHeaderContext =
  React.createContext<ShoppingHeaderContextValue | null>(null);

export const useShoppingNavHeader = (title: string, onBack: () => void) => {
  const ctx = React.useContext(ShoppingHeaderContext);
  const setConfig = ctx?.setConfig;
  const onBackRef = React.useRef(onBack);
  onBackRef.current = onBack;

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      setConfig({ variant: 'nav', title, onBack: () => onBackRef.current() });
      return () => setConfig(null);
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

  useFocusEffect(
    React.useCallback(() => {
      if (!setConfig) return;
      setConfig({
        variant: 'product',
        title: 'Chi tiết sản phẩm',
        shopName,
        onBack: () => onBackRef.current(),
        onShare: () => onShareRef.current?.(),
        onCart: () => onCartRef.current?.(),
        onSearch: () => onSearchRef.current?.(),
      });
      return () => setConfig(null);
    }, [setConfig, shopName]),
  );
};
