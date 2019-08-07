import { State, Action, StateContext, Selector } from '@ngxs/store';
import { BooksGet } from '../actions/books.actions';
import { Books } from '../models/books';
import { BooksService } from '../../books/services/books.service';
import { tap } from 'rxjs/operators';

@State<Books.State>({
  name: 'BooksState',
  defaults: { data: {} } as Books.State,
})
export class BooksState {
  @Selector()
  static getBooks({ data }: Books.State) {
    return data.items || [];
  }

  constructor(private booksService: BooksService) {}

  @Action(BooksGet)
  getBooks({ patchState }: StateContext<Books.State>) {
    return this.booksService.get().pipe(
      tap(data => {
        patchState({
          data,
        });
      }),
    );
  }
}
