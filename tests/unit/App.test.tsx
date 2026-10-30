// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import App from '../../src/App';
import { file, flush, harness } from './fakes';

afterEach(cleanup);

it('скрывает качество PNG и корректно включает кнопки', () => {
  render(<App />);
  expect(screen.getByRole('slider')).toHaveValue('90');
  expect(screen.getByRole('button', { name: 'Конвертировать' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Скачать ZIP' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'JPEG' }));
  expect(screen.getByRole('slider')).toHaveValue('90');
});

it('фиксирует настройки во время работы, разрешает очистку и повторный выбор', async () => {
  const h = harness(); render(<App controller={h.queue} />);
  const input = screen.getByLabelText('Фотографии HEIC или HEIF');
  fireEvent.change(input, { target: { files: [file()] } });
  expect(h.workers).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Конвертировать (1)' }));
  expect(screen.getByRole('radio', { name: 'PNG' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Выбрать файлы' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Очистить список' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Отменить' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Очистить список' }));
  await act(flush);
  expect(h.workers[0].terminate).toHaveBeenCalledOnce();
  expect(screen.getByText('Здесь появятся результаты')).toBeInTheDocument();
  fireEvent.change(input, { target: { files: [file()] } });
  fireEvent.click(screen.getByRole('button', { name: 'Конвертировать (1)' }));
  await act(async () => { h.workers[1].done(); await flush(); });
  expect(screen.getByRole('link', { name: 'Скачать фото.jpg' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name: 'PNG' }));
  expect(screen.getByText(/Создан с прежними параметрами/)).toBeInTheDocument();
});

it('выводит имя текстом, показывает ошибку и предлагает повтор', async () => {
  const h = harness(); render(<App controller={h.queue} />);
  fireEvent.change(screen.getByLabelText('Фотографии HEIC или HEIF'), { target: { files: [file('<img src=x onerror=alert(1)>.heic')] } });
  expect(screen.getByText('<img src=x onerror=alert(1)>.heic')).toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Конвертировать (1)' }));
  await act(async () => { h.workers[0].error(); await flush(); });
  expect(screen.getByText('Повреждённый файл.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Повторить ошибки' })).toBeEnabled();
});
