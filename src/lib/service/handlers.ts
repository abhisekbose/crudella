import {
    forgeCreateContext,
    forgeDeleteContext,
    forgeDetailContext,
    forgeListContext,
    forgeUpdateContext,
} from '../context/contextCreators';
import { CreateContext, DeleteContext, DetailContext, ListContext, UpdateContext } from '../context/crudContext';
import { Operation } from '../context/operation';
import { errorOrEmpty } from '../helpers';
import { ServiceImplementation } from '../settings/definitions';

export type DetailHandler<T, C> = (id: number, context: C) => Promise<T>;
export type CreateHandler<T, C> = (data: any, context: C) => Promise<T>;
export type UpdateHandler<T, C> = (id: number, data: any, context: C) => Promise<T>;
export type DeleteHandler<T, C> = (id: number, context: C) => Promise<T>;
export type ListHandler<T, C> = (filters: any, context: C) => Promise<T[]>;

export interface HandlerCreators<T, C> {
    detailHandler: (options?: any) => DetailHandler<T, C>;
    createHandler: (options?: any) => CreateHandler<T, C>;
    updateHandler: (options?: any) => UpdateHandler<T, C>;
    deleteHandler: (options?: any) => DeleteHandler<T, C>;
    listHandler: (options?: any) => ListHandler<T, C>;
}

export const createHandlers = <T extends { id: any }, C extends object>(
    implementation: ServiceImplementation<T, C>
): HandlerCreators<T, C> => {
    /**
     * Fetch resource, throw error when resource missing.
     * This method is used for handlers working with a single existing resource (get, update, delete)
     */
    const safeDetail = (context: Pick<DetailContext<T, C>, 'id' | 'context' | 'options'>): PromiseLike<T> =>
        implementation
            .detail({ ...context, type: Operation.DETAIL, write: false, safe: true })
            .then(errorOrEmpty(implementation.createNotFoundError()));

    const bootstrapOption = (operation: Operation, options: any = {}, context: C) =>
        Promise.resolve(implementation.getOptions(operation)).then(dynamicOptions => ({
            ...dynamicOptions,
            ...options,
            ...(context as object),
        }));

    const detailHandler = (options: any = {}): DetailHandler<T, C> => async (id: number, context: C) => {
        options = await bootstrapOption(Operation.DETAIL, options, context);
        const entity = await safeDetail({ id, context, options });
        const ctx: DetailContext<T, C> = forgeDetailContext({
            id,
            context,
            entity,
            options,
        });
        await implementation.authorize(ctx);
        const result = ctx.entity;
        return implementation.postprocessData(result, ctx);
    };
    const createHandler = (options: any = {}): CreateHandler<T, C> => async (data: any, context: C) => {
        options = await bootstrapOption(Operation.CREATE, options, context);
        const ctx: CreateContext<T, C> = forgeCreateContext({
            data,
            context,
            options,
            bareData: data,
        });
        const processedData = await implementation.processData(ctx.data, ctx);
        ctx.data = processedData;
        await implementation.authorize(ctx);
        const result = implementation.create(ctx);
        return implementation.postprocessData(result, ctx);
    };
    const updateHandler = (options: any = {}): UpdateHandler<T, C> => async (id: number, data: any, context: C) => {
        options = await bootstrapOption(Operation.UPDATE, options, context);
        const entity = await safeDetail({ id, context, options });
        const ctx: UpdateContext<T, C> = forgeUpdateContext({
            data,
            context,
            entity,
            options,
            bareData: data,
        });
        const processedData = await implementation.processData(ctx.data, ctx);
        ctx.data = processedData;
        await implementation.authorize(ctx);
        const result = implementation.update(ctx);
        return implementation.postprocessData(result, ctx);
    };

    const deleteHandler = (options: any = {}): DeleteHandler<T, C> => async (id: number, context: C) => {
        options = await bootstrapOption(Operation.DELETE, options, context);
        const entity = await safeDetail({ id, context, options });
        const ctx: DeleteContext<T, C> = forgeDeleteContext({
            id,
            context,
            entity,
            options,
        });
        await implementation.authorize(ctx);
        const result = implementation.delete(ctx);
        return implementation.postprocessData(result, ctx);
    };

    const listHandler = (options: any = {}): ListHandler<T, C> => async (filters: any, context: C) => {
        options = await bootstrapOption(Operation.LIST, options, context);
        const ctx: ListContext<T, C> = forgeListContext({
            context,
            options,
            filters,
        });
        const processedData = await implementation.processData(ctx.filters, ctx);
        ctx.filters = processedData;
        await implementation.authorize(ctx);
        const result = implementation.list(ctx);
        return implementation.postprocessData(result, ctx);
    };

    return {
        detailHandler,
        createHandler,
        updateHandler,
        deleteHandler,
        listHandler,
    };
};
